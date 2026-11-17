// SPDX-License-Identifier: Apache-2.0
export type SensitiveClass =
  | 'payment_card'
  | 'private_key'
  | 'jwt'
  | 'password_hash'
  | 'credential';

export interface SensitiveSpan {
  readonly start: number;
  readonly end: number;
  readonly kind: SensitiveClass;
}

export interface DetectionOptions {
  readonly cards: boolean;
}

interface Normalized {
  readonly text: string;
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

interface CardBrand {
  readonly prefix: RegExp;
  readonly lengths: readonly number[];
}

const INVISIBLE = /^[\p{Cf}\u{E0000}-\u{E007F}]$/u;
const MIN_CARD_DIGITS = 13;
const MAX_CARD_DIGITS = 19;
const MIN_CARD_GROUP = 4;
const LUHN_BASE = 10;
const LUHN_DOUBLE_LIMIT = 9;
const CARD_RUN = /\d(?:(?:[ -]|\r?\n)?\d)*/g;
const DIGIT_GROUP = /\d+/g;
const PRIVATE_KEY =
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----|$)/g;
const PASSWORD_HASH =
  /(?:\$(?:2[aby]\$|argon2|scrypt\$|pbkdf2)[\w$./+=,%-]*|\$(?:1|5|6|7|y)\$[\w./+=,-]+(?:\$[\w./+=,-]+)+|pbkdf2_sha\d+\$[\w$./+=,%-]+)/g;
const PERCENT_ESCAPE = /%[0-9A-F]{2}/g;
const ENCODED_SPACE = /%20/g;
const BASE64URL_DASH = /-/g;
const BASE64URL_UNDERSCORE = /_/g;
const DOTTED_RUN = /[\w-]+(?:\.[\w-]*)*/g;
const JWT_SEGMENTS = 3;

const CARD_BRANDS: readonly CardBrand[] = [
  { prefix: /^4/, lengths: [13, 16, 19] },
  { prefix: /^(?:5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/, lengths: [16] },
  { prefix: /^3[47]/, lengths: [15] },
  { prefix: /^(?:6011|65|62)/, lengths: [16, 17, 18, 19] },
  { prefix: /^35(?:2[89]|[3-8]\d)/, lengths: [16, 17, 18, 19] },
  { prefix: /^(?:30[0-5]|36|38)/, lengths: [14, 15, 16, 17, 18, 19] },
];

function normalize(value: string): Normalized {
  const text: string[] = [];
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const point of value) {
    const end = index + point.length;
    for (const char of point.normalize('NFKC')) {
      if (INVISIBLE.test(char)) continue;
      text.push(char);
      for (let unit = 0; unit < char.length; unit++) {
        starts.push(index);
        ends.push(end);
      }
    }
    index = end;
  }
  return { text: text.join(''), starts, ends };
}

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let position = 0; position < digits.length; position++) {
    let digit = Number(digits[digits.length - 1 - position]);
    if (position % 2 === 1) {
      digit *= 2;
      if (digit > LUHN_DOUBLE_LIMIT) digit -= LUHN_DOUBLE_LIMIT;
    }
    sum += digit;
  }
  return sum % LUHN_BASE === 0;
}

function isCardNumber(digits: string): boolean {
  if (digits.length < MIN_CARD_DIGITS || digits.length > MAX_CARD_DIGITS) return false;
  const brand = CARD_BRANDS.find((candidate) => candidate.prefix.test(digits));
  return brand !== undefined && brand.lengths.includes(digits.length) && passesLuhn(digits);
}

function decodesToJwtHeader(segment: string): boolean {
  try {
    const base64 = segment.replace(BASE64URL_DASH, '+').replace(BASE64URL_UNDERSCORE, '/');
    const header: unknown = JSON.parse(atob(base64));
    return typeof header === 'object' && header !== null && Object.hasOwn(header, 'alg');
  } catch {
    return false;
  }
}

function spansOf(text: string, pattern: RegExp, kind: SensitiveClass): SensitiveSpan[] {
  return [...text.matchAll(pattern)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
    kind,
  }));
}

// Cards are written in groups of four or more; phone numbers and short codes are not.
function isCardGrouping(lengths: readonly number[]): boolean {
  return lengths.slice(0, -1).every((length) => length >= MIN_CARD_GROUP);
}

// A card is a window of whole digit groups, so a number is never cut inside a group.
function cardWindows(run: string, offset: number): SensitiveSpan[] {
  const groups = [...run.matchAll(DIGIT_GROUP)];
  const spans: SensitiveSpan[] = [];
  for (let first = 0; first < groups.length; first++) {
    const lengths: number[] = [];
    let digits = '';
    for (let last = first; last < groups.length; last++) {
      const closing = groups[last]?.[0] ?? '';
      digits += closing;
      lengths.push(closing.length);
      if (digits.length > MAX_CARD_DIGITS) break;
      if (!isCardGrouping(lengths) || !isCardNumber(digits)) continue;
      const start = offset + (groups[first]?.index ?? 0);
      const end = offset + (groups[last]?.index ?? 0) + closing.length;
      spans.push({ start, end, kind: 'payment_card' });
    }
  }
  return spans;
}

function cardSpans(text: string): SensitiveSpan[] {
  return [...text.matchAll(CARD_RUN)].flatMap((run) => cardWindows(run[0], run.index));
}

function percentEncoded(secret: string): string[] {
  try {
    const upper = encodeURIComponent(secret);
    const lower = upper.replace(PERCENT_ESCAPE, (escape) => escape.toLowerCase());
    return [upper, lower, upper.replace(ENCODED_SPACE, '+'), lower.replace(ENCODED_SPACE, '+')];
  } catch {
    return [];
  }
}

// An API that echoes a credential in a link returns it percent-encoded.
function secretForms(secrets: readonly string[]): string[] {
  const forms = secrets.flatMap((secret) => [
    secret,
    normalize(secret).text,
    ...percentEncoded(secret),
  ]);
  return [...new Set(forms)].filter((form) => form !== '');
}

function jwtSpans(text: string): SensitiveSpan[] {
  const spans: SensitiveSpan[] = [];
  for (const run of text.matchAll(DOTTED_RUN)) {
    const segments = run[0].split('.');
    let offset = 0;
    const offsets = segments.map((segment) => {
      const start = offset;
      offset += segment.length + 1;
      return start;
    });
    for (let at = 0; at + JWT_SEGMENTS <= segments.length; at++) {
      const header = segments[at] ?? '';
      const payload = segments[at + 1] ?? '';
      if (header === '' || payload === '' || !decodesToJwtHeader(header)) continue;
      const last = at + JWT_SEGMENTS - 1;
      const start = run.index + (offsets[at] ?? 0);
      const end = run.index + (offsets[last] ?? 0) + (segments[last] ?? '').length;
      spans.push({ start, end, kind: 'jwt' });
      at = last;
    }
  }
  return spans;
}

function occurrences(text: string, needle: string): SensitiveSpan[] {
  const spans: SensitiveSpan[] = [];
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) {
    spans.push({ start: at, end: at + needle.length, kind: 'credential' });
  }
  return spans;
}

// A span that cannot be mapped back covers the whole value, so nothing is left unredacted.
function toOriginal(
  spans: readonly SensitiveSpan[],
  normalized: Normalized,
  length: number,
): SensitiveSpan[] {
  return spans.map((span) => {
    const start = normalized.starts[span.start];
    const end = normalized.ends[span.end - 1];
    return start === undefined || end === undefined
      ? { start: 0, end: length, kind: span.kind }
      : { start, end, kind: span.kind };
  });
}

function merge(spans: readonly SensitiveSpan[]): SensitiveSpan[] {
  const merged: SensitiveSpan[] = [];
  for (const span of [...spans].sort((a, b) => a.start - b.start || b.end - a.end)) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start <= last.end) {
      merged[merged.length - 1] = { ...last, end: Math.max(last.end, span.end) };
    } else {
      merged.push(span);
    }
  }
  return merged;
}

export function detectSensitive(
  value: string,
  secrets: readonly string[],
  options: DetectionOptions,
): readonly SensitiveSpan[] {
  const normalized = normalize(value);
  const { text } = normalized;
  const named = secretForms(secrets);
  const patterned = [
    ...(options.cards ? cardSpans(text) : []),
    ...spansOf(text, PRIVATE_KEY, 'private_key'),
    ...jwtSpans(text),
    ...spansOf(text, PASSWORD_HASH, 'password_hash'),
    ...named.flatMap((secret) => occurrences(text, secret)),
  ];
  const direct = named.flatMap((secret) => occurrences(value, secret));
  return merge([...toOriginal(patterned, normalized, value.length), ...direct]);
}

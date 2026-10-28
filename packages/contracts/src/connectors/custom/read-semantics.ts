// SPDX-License-Identifier: Apache-2.0
export const WRITE_VERBS: ReadonlySet<string> = new Set([
  'create',
  'update',
  'delete',
  'remove',
  'insert',
  'upsert',
  'add',
  'set',
  'patch',
  'put',
  'archive',
  'cancel',
  'close',
  'approve',
  'submit',
  'send',
  'move',
  'assign',
  'import',
  'sync',
  'trigger',
  'run',
  'execute',
  'reset',
  'void',
  'post',
  'publish',
  'revoke',
  'disable',
  'enable',
  'destroy',
  'build',
  'logout',
  'signout',
  'purge',
  'edit',
  'save',
  'write',
  'restore',
  'start',
  'stop',
  'restart',
  'retry',
  'confirm',
  'unsubscribe',
  'merge',
  'deploy',
  'generate',
  'apply',
  'upload',
  'reject',
  'settle',
]);

// Reports and exports often start a job, so a POST under either word is never a recorded read.
export const NON_READ_TOKENS: ReadonlySet<string> = new Set(['export', 'report']);

// Date-window parameter names; exempt as exact tokens only beside a date word or a date value.
export const RANGE_PARAM_TOKENS: ReadonlySet<string> = new Set(['start', 'stop']);

// Paging and cursor parameters that real read APIs name `start` or `syncToken`; exact names, in those two slots only.
export const PAGING_VERB_EXEMPT_NAMES: ReadonlySet<string> = new Set([
  'start',
  'startAt',
  'offset',
  'syncToken',
  'sync_token',
  'pageToken',
  'nextSyncToken',
]);

export const FRAMING_HEADERS: ReadonlySet<string> = new Set([
  'content-length',
  'transfer-encoding',
  'connection',
  'te',
  'upgrade',
]);

export const METHOD_OVERRIDE_HEADERS: ReadonlySet<string> = new Set([
  'x-http-method',
  'x-http-method-override',
  'x-method-override',
]);

export const METHOD_OVERRIDE_PARAM = '_method';

export const READ_VERBS: ReadonlySet<string> = new Set([
  'list',
  'search',
  'query',
  'find',
  'get',
  'fetch',
  'read',
  'lookup',
  'filter',
]);

export const PAGING_PARAM_NAMES: ReadonlySet<string> = new Set([
  'page',
  'per_page',
  'page_size',
  'pagesize',
  'limit',
  'offset',
  'cursor',
  'after',
  'before',
  'starting_after',
  'page_token',
  'pagetoken',
  'next',
  'since',
  'updated_since',
  'modified_since',
]);

export const SECRET_KEY_TOKENS: ReadonlySet<string> = new Set([
  'auth',
  'authorization',
  'token',
  'key',
  'apikey',
  'secret',
  'session',
  'sessionid',
  'sid',
  'cookie',
  'csrf',
  'xsrf',
  'password',
  'passwd',
  'pwd',
  'pass',
  'signature',
  'sig',
  'bearer',
  'otp',
  'jwt',
  'credential',
  'credentials',
]);

export const LOGIN_CHALLENGE_TOKENS: ReadonlySet<string> = new Set([
  'captcha',
  'recaptcha',
  'hcaptcha',
  'turnstile',
  'mfa',
  'otp',
  'totp',
  'two_factor',
  '2fa',
  'verification_code',
]);

const LOWER_TO_UPPER = /([a-z0-9])([A-Z])/g;
const ACRONYM_END = /([A-Z]+)([A-Z][a-z])/g;
const LETTER_TO_DIGIT = /([A-Za-z])([0-9])/g;
const DIGIT_TO_LETTER = /([0-9])([A-Za-z])/g;
const NON_ALPHANUMERIC = /[^A-Za-z0-9]+/;

export function wordTokens(value: string): readonly string[] {
  return value
    .replace(LOWER_TO_UPPER, '$1 $2')
    .replace(ACRONYM_END, '$1 $2')
    .replace(LETTER_TO_DIGIT, '$1 $2')
    .replace(DIGIT_TO_LETTER, '$1 $2')
    .split(NON_ALPHANUMERIC)
    .filter((token) => token !== '')
    .map((token) => token.toLowerCase());
}

const hasToken = (value: string, tokens: ReadonlySet<string>): boolean =>
  wordTokens(value).some((token) => tokens.has(token));

const SUBSTRING_VERB_MIN_LENGTH = 6;
const PREFIX_VERB_MIN_LENGTH = 5;
const SHORT_VERB_MIN_REMAINDER = 3;

// Endings that turn a verb into a noun or a tense, so `updated`, `assignee` and `deployments` read.
const BENIGN_VERB_ENDINGS: ReadonlySet<string> = new Set([
  'd',
  's',
  'ed',
  'es',
  'er',
  'ers',
  'or',
  'ors',
  'ee',
  'ees',
  'ing',
  'ion',
  'ions',
  'ation',
  'ations',
  'ment',
  'ments',
  'ant',
  'ance',
  'ted',
  'ting',
  'led',
  'ling',
  'lation',
  'ped',
  'ping',
]);

// Ordinary words that start with a short verb; the prefix rule would otherwise refuse them.
const ORDINARY_WORDS: ReadonlySet<string> = new Set([
  'settings',
  'setting',
  'settled',
  'settles',
  'settlement',
  'settlements',
  'address',
  'addresses',
  'addressed',
  'addressing',
  'addition',
  'additions',
  'additional',
  'additive',
  'runtime',
  'runtimes',
  'runner',
  'runners',
  'running',
  'postcode',
  'postcodes',
  'postgres',
  'synchronous',
]);

function endingsAfter(token: string, verb: string): string[] {
  const endings: string[] = [];
  for (let at = token.indexOf(verb); at !== -1; at = token.indexOf(verb, at + 1)) {
    endings.push(token.slice(at + verb.length));
  }
  return endings;
}

// A run-together token such as `deleteall`, `massdelete` or `runjob` carries a verb with no separator.
function matchesVerb(token: string, verb: string): boolean {
  if (token === verb) return true;
  if (ORDINARY_WORDS.has(token)) return false;
  if (verb.length >= SUBSTRING_VERB_MIN_LENGTH) {
    return endingsAfter(token, verb).some((ending) => !BENIGN_VERB_ENDINGS.has(ending));
  }
  if (!token.startsWith(verb)) return false;
  const ending = token.slice(verb.length);
  if (BENIGN_VERB_ENDINGS.has(ending)) return false;
  return verb.length >= PREFIX_VERB_MIN_LENGTH || ending.length >= SHORT_VERB_MIN_REMAINDER;
}

const tokenHasVerb = (token: string, verbs: ReadonlySet<string>): boolean =>
  [...verbs].some((verb) => matchesVerb(token, verb));

export const hasWriteVerb = (value: string): boolean =>
  wordTokens(value).some((token) => tokenHasVerb(token, WRITE_VERBS));

// Words that make `start` or `stop` a date boundary rather than an action; `at` and `on` are too ambiguous without a date value.
export const DATE_WORDS: ReadonlySet<string> = new Set([
  'date',
  'datetime',
  'time',
  'timestamp',
  'day',
  'week',
  'month',
  'year',
  'window',
  'range',
  'period',
]);

const WINDOW_VALUE = /^\{window\.(?:start|end)\}$/;
const DATE_LITERAL =
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

// The exact tokens start and stop are date boundaries only beside a date word or with a window token or date value.
export function hasWriteVerbInParam(name: string, value: string): boolean {
  const tokens = wordTokens(name);
  const valueIsDate = WINDOW_VALUE.test(value) || DATE_LITERAL.test(value);
  const besideDate = (index: number): boolean =>
    DATE_WORDS.has(tokens[index - 1] ?? '') || DATE_WORDS.has(tokens[index + 1] ?? '');
  return tokens.some((token, index) => {
    const boundary = RANGE_PARAM_TOKENS.has(token) && (valueIsDate || besideDate(index));
    return !boundary && tokenHasVerb(token, WRITE_VERBS);
  });
}

export const hasNonReadToken = (value: string): boolean =>
  wordTokens(value).some(
    (token) => tokenHasVerb(token, NON_READ_TOKENS) || NON_READ_TOKENS.has(token.replace(/s$/, '')),
  );

export const isFramingHeader = (name: string): boolean => FRAMING_HEADERS.has(name.toLowerCase());

export const isMethodOverrideHeader = (name: string): boolean =>
  METHOD_OVERRIDE_HEADERS.has(name.toLowerCase());

export const isMethodOverrideParam = (name: string): boolean =>
  name.toLowerCase() === METHOD_OVERRIDE_PARAM;

export const hasReadVerb = (value: string): boolean => hasToken(value, READ_VERBS);

export const isSecretKeyName = (name: string): boolean => hasToken(name, SECRET_KEY_TOKENS);

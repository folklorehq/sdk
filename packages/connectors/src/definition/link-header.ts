// SPDX-License-Identifier: Apache-2.0
const PARAMETER = /;\s*([A-Za-z*-]+)\s*=\s*(?:"([^"]*)"|([^\s;,]+))/g;
const NEXT_RELATION = 'next';

export function nextLinkFromHeader(value: string | null): string | null {
  if (!value) return null;
  for (const entry of splitEntries(value)) {
    const url = nextUrlOf(entry);
    if (url !== null) return url;
  }
  return null;
}

// A comma may sit inside <...> or a quoted parameter, so the split cannot be a plain split(',').
function splitEntries(value: string): string[] {
  const entries: string[] = [];
  let current = '';
  let inAngle = false;
  let inQuote = false;
  for (const char of value) {
    if (char === '"' && !inAngle) inQuote = !inQuote;
    if (char === '<' && !inQuote) inAngle = true;
    if (char === '>' && !inQuote) inAngle = false;
    if (char === ',' && !inAngle && !inQuote) {
      entries.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  entries.push(current);
  return entries;
}

function nextUrlOf(entry: string): string | null {
  const trimmed = entry.trim();
  const close = trimmed.indexOf('>');
  if (!trimmed.startsWith('<') || close < 0) return null;
  const url = trimmed.slice(1, close);
  if (url === '') return null;
  return relationsOf(trimmed.slice(close + 1)).includes(NEXT_RELATION) ? url : null;
}

function relationsOf(parameters: string): string[] {
  const relations: string[] = [];
  for (const [, name, quoted, bare] of parameters.matchAll(PARAMETER)) {
    if (name?.toLowerCase() !== 'rel') continue;
    relations.push(...(quoted ?? bare ?? '').toLowerCase().split(/\s+/));
  }
  return relations;
}

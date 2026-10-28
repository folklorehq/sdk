// SPDX-License-Identifier: Apache-2.0
import type { StreamSpec } from '@folklore/contracts';
import { resolveJsonPointer } from '@folklore/utils';
import { nextLinkFromHeader } from './link-header.js';

export interface PageOutcome {
  readonly next:
    | { readonly kind: 'token'; readonly value: string }
    | { readonly kind: 'url'; readonly url: string }
    | null;
}

type Paginator = StreamSpec['paginator'];

const NO_NEXT: PageOutcome = { next: null };

export function nextPage(
  paginator: Paginator,
  response: { readonly body: unknown; readonly header: (name: string) => string | null },
  recordCount: number,
  current: string | null,
): PageOutcome {
  switch (paginator.type) {
    case 'none':
      return NO_NEXT;
    case 'page_number':
      return pageNumber(paginator, response.body, recordCount, current);
    case 'cursor':
      return token(tokenText(resolveJsonPointer(response.body, paginator.nextPointer)));
    case 'offset':
      return offset(paginator, recordCount, current);
    case 'next_url':
      return url(resolveJsonPointer(response.body, paginator.nextUrlPointer));
    case 'link_header':
      return url(nextLinkFromHeader(response.header('link')));
  }
}

function pageNumber(
  paginator: Extract<Paginator, { type: 'page_number' }>,
  body: unknown,
  recordCount: number,
  current: string | null,
): PageOutcome {
  if (recordCount === 0 || resolveJsonPointer(body, paginator.lastPagePointer) === true) {
    return NO_NEXT;
  }
  const page = current === null ? paginator.start : Number(current);
  return Number.isSafeInteger(page) ? token(String(page + 1)) : NO_NEXT;
}

function offset(
  paginator: Extract<Paginator, { type: 'offset' }>,
  recordCount: number,
  current: string | null,
): PageOutcome {
  if (recordCount < paginator.limit) return NO_NEXT;
  const position = current === null ? 0 : Number(current);
  return Number.isSafeInteger(position) ? token(String(position + paginator.limit)) : NO_NEXT;
}

function tokenText(value: unknown): string | null {
  if (typeof value === 'string') return value === '' ? null : value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

function token(value: string | null): PageOutcome {
  return value === null ? NO_NEXT : { next: { kind: 'token', value } };
}

function url(value: unknown): PageOutcome {
  return typeof value === 'string' && value !== ''
    ? { next: { kind: 'url', url: value } }
    : NO_NEXT;
}

// SPDX-License-Identifier: Apache-2.0
export interface NotionPosition {
  editedAt: string;
  pageId: string | null;
}

export interface NotionSealedCursor {
  position: NotionPosition | null;
  listing?: NotionListingState;
}

export interface NotionListingState {
  mode: 'ascending';
  searchCursor: string | null;
  /** Creation floor of the pass that opened this listing, so later chunks classify creates the same way. */
  since?: string;
  backfill?: true;
}

const TUPLE_SEPARATOR = '|';
const JSON_CURSOR_PREFIX = '{';
const EMPTY_CURSOR: NotionSealedCursor = { position: null };

export function parseNotionCursor(value: string | null): NotionSealedCursor {
  if (value === null || value === '') return { ...EMPTY_CURSOR };
  if (value.startsWith(JSON_CURSOR_PREFIX)) return parseJsonCursor(value);
  const position = parsePosition(value);
  return position === null ? { ...EMPTY_CURSOR } : { position };
}

/** A listing-free cursor stays `${iso}|${id}` so an older build's string compare still stops at the right page. */
export function serializeNotionCursor(cursor: NotionSealedCursor): string {
  if (cursor.listing === undefined) return serializePosition(cursor.position);
  return JSON.stringify({
    position: cursor.position === null ? null : serializePosition(cursor.position),
    listing: cursor.listing,
  });
}

export function isAfterPosition(
  page: { id: string; last_edited_time: string },
  position: NotionPosition | null,
): boolean {
  if (position === null) return true;
  const pageMs = Date.parse(page.last_edited_time);
  const positionMs = Date.parse(position.editedAt);
  if (pageMs !== positionMs) return pageMs > positionMs;
  return position.pageId === null || page.id > position.pageId;
}

function serializePosition(position: NotionPosition | null): string {
  if (position === null) return '';
  return position.pageId === null
    ? position.editedAt
    : `${position.editedAt}${TUPLE_SEPARATOR}${position.pageId}`;
}

function parsePosition(value: string): NotionPosition | null {
  const separator = value.indexOf(TUPLE_SEPARATOR);
  const editedAt = separator === -1 ? value : value.slice(0, separator);
  if (Number.isNaN(Date.parse(editedAt))) return null;
  const pageId = separator === -1 ? '' : value.slice(separator + 1);
  return { editedAt, pageId: pageId === '' ? null : pageId };
}

function parseJsonCursor(value: string): NotionSealedCursor {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { ...EMPTY_CURSOR };
  }
  if (typeof parsed !== 'object' || parsed === null) return { ...EMPTY_CURSOR };
  const record = parsed as Record<string, unknown>;
  const position =
    typeof record['position'] === 'string' ? parsePosition(record['position']) : null;
  const listing = parseListing(record['listing']);
  return listing === undefined ? { position } : { position, listing };
}

function parseListing(value: unknown): NotionListingState | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (record['mode'] !== 'ascending') return undefined;
  const searchCursor = record['searchCursor'];
  if (searchCursor !== null && typeof searchCursor !== 'string') return undefined;
  const since = record['since'];
  return {
    mode: 'ascending',
    searchCursor,
    ...(typeof since === 'string' && !Number.isNaN(Date.parse(since)) ? { since } : {}),
    ...(record['backfill'] === true ? { backfill: true } : {}),
  };
}

// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const CHAINED_CURSOR_VERSION = 1;
const JIRA_CURSOR_INVALID = 'jira_cursor_invalid';

const chainedCursorSchema = z
  .object({
    v: z.literal(CHAINED_CURSOR_VERSION),
    updated: z.string().nullable(),
    since: z.string().nullable(),
  })
  .strict();

/** Where a pull resumes: issues updated at or after `updated`; comments and creates are judged against `since`. */
export interface JiraPullPosition {
  updated: string | null;
  since: string | null;
}

// A plain watermark means every earlier comment already shipped with its issue. Mid-chain, an issue newer
// than the watermark can still own older comments and be born before it, so the chain keeps the floor it started from.
export function readJiraPullCursor(
  value: string | null,
  windowStart: string | null,
): JiraPullPosition {
  if (value === null) return { updated: null, since: windowStart };
  if (!value.startsWith('{')) return { updated: value, since: value };
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new Error(JIRA_CURSOR_INVALID);
  }
  const parsed = chainedCursorSchema.safeParse(decoded);
  if (!parsed.success) throw new Error(JIRA_CURSOR_INVALID);
  return { updated: parsed.data.updated, since: parsed.data.since };
}

export function writeJiraPullCursor(position: JiraPullPosition, hasMore: boolean): string | null {
  if (!hasMore) return position.updated;
  return JSON.stringify({
    v: CHAINED_CURSOR_VERSION,
    updated: position.updated,
    since: position.since,
  });
}

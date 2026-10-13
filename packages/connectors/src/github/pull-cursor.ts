// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const CHAINED_CURSOR_VERSION = 1;
const GITHUB_CURSOR_INVALID = 'github_cursor_invalid';

const chainedCursorSchema = z
  .object({
    v: z.literal(CHAINED_CURSOR_VERSION),
    updatedAt: z.string().nullable(),
    commentsSince: z.string().nullable(),
  })
  .strict();

/** Where a pull resumes: PRs updated at or after `updatedAt`, comments updated at or after `commentsSince`. */
export interface GitHubPullPosition {
  updatedAt: string | null;
  commentsSince: string | null;
}

// A plain watermark means every earlier comment already shipped with its PR. Mid-chain, a PR newer
// than the watermark can still own older comments, so the chain keeps the floor it started from.
export function readGitHubPullCursor(
  value: string | null,
  windowStart: string | null,
): GitHubPullPosition {
  if (value === null) return { updatedAt: null, commentsSince: windowStart };
  if (!value.startsWith('{')) return { updatedAt: value, commentsSince: value };
  let decoded: unknown;
  try {
    decoded = JSON.parse(value);
  } catch {
    throw new Error(GITHUB_CURSOR_INVALID);
  }
  const parsed = chainedCursorSchema.safeParse(decoded);
  if (!parsed.success) throw new Error(GITHUB_CURSOR_INVALID);
  return { updatedAt: parsed.data.updatedAt, commentsSince: parsed.data.commentsSince };
}

export function writeGitHubPullCursor(
  position: GitHubPullPosition,
  hasMore: boolean,
): string | null {
  if (!hasMore) return position.updatedAt;
  return JSON.stringify({
    v: CHAINED_CURSOR_VERSION,
    updatedAt: position.updatedAt,
    commentsSince: position.commentsSince,
  });
}

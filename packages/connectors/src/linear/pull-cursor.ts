// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const LINEAR_CURSOR_VERSION = 1;
export const LINEAR_CURSOR_TOKEN_MAX = 256;
const LINEAR_CURSOR_TOKEN_TOO_LONG = 'linear_cursor_token_too_long';

export const LINEAR_PULL_STREAMS = ['projects', 'cycles', 'issues', 'comments'] as const;
export type LinearPullStream = (typeof LINEAR_PULL_STREAMS)[number];

export interface LinearSlice {
  readonly untilMs: number;
  readonly after: string | null;
  readonly lastId: string | null;
}

export interface LinearStreamPosition {
  readonly wm: number | null;
  readonly emitAfter: number | null;
  readonly slice: LinearSlice | null;
}

export type LinearPullPosition = Readonly<Record<LinearPullStream, LinearStreamPosition>>;

export const FRESH_LINEAR_STREAM: LinearStreamPosition = { wm: null, emitAfter: null, slice: null };

const tokenSchema = z.string().max(LINEAR_CURSOR_TOKEN_MAX).nullable();

const sliceSchema = z
  .object({ untilMs: z.number().int(), after: tokenSchema, lastId: tokenSchema })
  .strict();

const streamSchema = z
  .object({
    wm: z.number().int().nullable(),
    emitAfter: z.number().int().nullable(),
    slice: sliceSchema.nullable(),
  })
  .strict();

const cursorSchema = z
  .object({
    v: z.literal(LINEAR_CURSOR_VERSION),
    w: z
      .object({
        projects: streamSchema,
        cycles: streamSchema,
        issues: streamSchema,
        comments: streamSchema,
      })
      .strict(),
  })
  .strict();

function freshPosition(): LinearPullPosition {
  return {
    projects: FRESH_LINEAR_STREAM,
    cycles: FRESH_LINEAR_STREAM,
    issues: FRESH_LINEAR_STREAM,
    comments: FRESH_LINEAR_STREAM,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** A missing or unrecognised cursor restarts every stream from the history floor. */
export function readLinearPullCursor(value: string | null): LinearPullPosition {
  if (value === null) return freshPosition();
  const parsed = cursorSchema.safeParse(parseJson(value));
  return parsed.success ? parsed.data.w : freshPosition();
}

/** Throws for a token over the cap, so a cursor never outgrows the parameter store's value limit. */
export function writeLinearPullCursor(position: LinearPullPosition): string {
  const written = { v: LINEAR_CURSOR_VERSION, w: position };
  if (!cursorSchema.safeParse(written).success) throw new Error(LINEAR_CURSOR_TOKEN_TOO_LONG);
  return JSON.stringify(written);
}

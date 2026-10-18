// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  FRESH_LINEAR_STREAM,
  LINEAR_CURSOR_TOKEN_MAX,
  LINEAR_PULL_STREAMS,
  readLinearPullCursor,
  writeLinearPullCursor,
  type LinearPullPosition,
} from '../src/linear/pull-cursor.js';

const ALL_FRESH: LinearPullPosition = {
  projects: FRESH_LINEAR_STREAM,
  cycles: FRESH_LINEAR_STREAM,
  issues: FRESH_LINEAR_STREAM,
  comments: FRESH_LINEAR_STREAM,
};

const MID_SLICE: LinearPullPosition = {
  ...ALL_FRESH,
  issues: {
    wm: 1_760_000_000_000,
    emitAfter: 1_759_000_000_000,
    slice: { untilMs: 1_760_000_900_000, after: 'cursor-1', lastId: 'node-9' },
  },
};

function longToken(): string {
  return 'a'.repeat(LINEAR_CURSOR_TOKEN_MAX);
}

describe('linear pull cursor', () => {
  it('reads null as every stream fresh', () => {
    expect(readLinearPullCursor(null)).toEqual(ALL_FRESH);
  });

  it('round-trips a position', () => {
    expect(readLinearPullCursor(writeLinearPullCursor(MID_SLICE))).toEqual(MID_SLICE);
  });

  it('reads a different version as fresh', () => {
    const stored = JSON.parse(writeLinearPullCursor(MID_SLICE)) as Record<string, unknown>;
    expect(readLinearPullCursor(JSON.stringify({ ...stored, v: 2 }))).toEqual(ALL_FRESH);
  });

  it('reads a cursor with an extra key as fresh', () => {
    const stored = JSON.parse(writeLinearPullCursor(MID_SLICE)) as Record<string, unknown>;
    expect(readLinearPullCursor(JSON.stringify({ ...stored, extra: 1 }))).toEqual(ALL_FRESH);
  });

  it('reads a plain ISO watermark as fresh', () => {
    expect(readLinearPullCursor('2026-01-02T00:00:00.000Z')).toEqual(ALL_FRESH);
  });

  it('reads a stored token over the cap as fresh', () => {
    const stored = JSON.parse(writeLinearPullCursor(MID_SLICE)) as {
      w: { issues: { slice: { after: string } } };
    };
    stored.w.issues.slice.after = 'a'.repeat(LINEAR_CURSOR_TOKEN_MAX + 1);
    expect(readLinearPullCursor(JSON.stringify(stored))).toEqual(ALL_FRESH);
  });

  it('writes exactly the documented keys', () => {
    const written = JSON.parse(writeLinearPullCursor(MID_SLICE)) as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['v', 'w']);
    const streams = written.w as Record<string, Record<string, unknown>>;
    expect(Object.keys(streams).sort()).toEqual([...LINEAR_PULL_STREAMS].sort());
    for (const stream of LINEAR_PULL_STREAMS) {
      expect(Object.keys(streams[stream]!).sort()).toEqual(['emitAfter', 'slice', 'wm']);
    }
    expect(Object.keys(streams.issues!.slice as object).sort()).toEqual([
      'after',
      'lastId',
      'untilMs',
    ]);
  });

  it('stays under the SSM standard-tier limit in the worst case', () => {
    const slice = { untilMs: 1_760_000_900_000, after: longToken(), lastId: longToken() };
    const stream = { wm: 1_760_000_000_000, emitAfter: 1_759_000_000_000, slice };
    const worst: LinearPullPosition = {
      projects: stream,
      cycles: stream,
      issues: stream,
      comments: stream,
    };
    expect(Buffer.byteLength(writeLinearPullCursor(worst))).toBeLessThan(4096);
  });

  it('refuses to write a token over the cap', () => {
    const tooLong: LinearPullPosition = {
      ...ALL_FRESH,
      comments: {
        wm: null,
        emitAfter: null,
        slice: { untilMs: 1, after: 'a'.repeat(LINEAR_CURSOR_TOKEN_MAX + 1), lastId: null },
      },
    };
    expect(() => writeLinearPullCursor(tooLong)).toThrow('linear_cursor_token_too_long');
  });
});

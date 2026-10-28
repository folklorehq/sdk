// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  SPEC_MAX_ENVELOPE_BYTES,
  SPEC_MAX_STREAM_STATE_BYTES,
  specStreamStateSchema,
  type SpecStreamState,
} from '@folklore/contracts';
import { ConnectorSpecError } from '@folklore/errors';
import {
  emptyStreamState,
  isCursorEnvelope,
  readSpecCursor,
  writeSpecCursor,
} from '../../src/definition/spec-cursor.js';
import { spec, stream } from './fixtures/streams.js';

const ONE = spec(stream());
const TWO = spec(
  stream({ name: 'projects', mapping: null }),
  stream({
    name: 'tasks',
    request: { path: '/v1/projects/{parent.id}/tasks' },
    parent: { stream: 'projects', bind: { id: '/id' } },
  }),
);

function states(entries: Record<string, Partial<SpecStreamState>>) {
  return new Map(
    Object.entries(entries).map(([name, state]) => [name, { ...emptyStreamState(), ...state }]),
  );
}

function pointer(overrides: Partial<SpecStreamState>): SpecStreamState {
  return { ...emptyStreamState(), ...overrides };
}

describe('writeSpecCursor', () => {
  it('writes a bare string for one finished stream', () => {
    expect(writeSpecCursor(ONE, states({ items: { c: 'sync-token' } }))).toBe('sync-token');
  });

  it('writes null when nothing is stored', () => {
    expect(writeSpecCursor(ONE, states({ items: {} }))).toBeNull();
    expect(writeSpecCursor(TWO, states({}))).toBeNull();
  });

  it('writes an envelope for one stream with an in-flight page', () => {
    const written = writeSpecCursor(
      ONE,
      states({
        items: {
          c: 'old',
          p: 'page-2',
          w: { s: '2025-10-27T12:00:00.000Z', e: '2026-10-27T12:00:00.000Z' },
        },
      }),
    );
    expect(isCursorEnvelope(written)).toBe(true);
    const envelope = JSON.parse(written!) as { v: number; streams: Record<string, string> };
    expect(envelope.v).toBe(1);
    expect(specStreamStateSchema.parse(JSON.parse(envelope.streams['items']!))).toMatchObject({
      c: 'old',
      p: 'page-2',
    });
  });

  it('writes an envelope for two streams even when both are finished', () => {
    const written = writeSpecCursor(TWO, states({ projects: { c: 'a' }, tasks: { c: 'b' } }));
    expect(isCursorEnvelope(written)).toBe(true);
  });

  it('throws spec_cursor_too_long when a stream state is over the limit', () => {
    const huge = states({ items: { c: 'x'.repeat(600), p: 'page' } });
    const error = captured(() => writeSpecCursor(ONE, huge));
    expect(error).toBeInstanceOf(ConnectorSpecError);
    expect(error.code).toBe('spec_cursor_too_long');
    expect(error.cause).toBeUndefined();
  });

  it('keeps the worst case state for one stream under the per-stream limit and round-trips it', () => {
    const worst = pointer({
      c: 'c'.repeat(512),
      m: 'm'.repeat(512),
      d: true,
      p: 'p'.repeat(512),
      i: 1000,
      k: 'k'.repeat(256),
      w: { s: '2025-10-27T12:00:00.000Z', e: '2026-10-27T12:00:00.000Z' },
    });
    expect(JSON.stringify(worst).length).toBeLessThanOrEqual(SPEC_MAX_STREAM_STATE_BYTES);
    const written = writeSpecCursor(ONE, new Map([['items', worst]]));
    expect(readSpecCursor(ONE, written).get('items')).toEqual(worst);
  });

  it('fits three worst-case streams in the envelope limit', () => {
    const worst = pointer({
      c: 'c'.repeat(512),
      m: 'm'.repeat(512),
      d: true,
      p: 'p'.repeat(512),
      i: 1000,
      k: 'k'.repeat(256),
      w: { s: '2025-10-27T12:00:00.000Z', e: '2026-10-27T12:00:00.000Z' },
    });
    const three = spec(
      stream({ name: 'a', mapping: null }),
      stream({
        name: 'b',
        mapping: null,
        request: { path: '/v1/{parent.id}' },
        parent: { stream: 'a', bind: { id: '/id' } },
      }),
      stream({
        name: 'c',
        request: { path: '/v1/{parent.id}' },
        parent: { stream: 'b', bind: { id: '/id' } },
      }),
    );
    const written = writeSpecCursor(
      three,
      new Map([
        ['a', worst],
        ['b', worst],
        ['c', worst],
      ]),
    )!;
    expect(written.length).toBeLessThanOrEqual(SPEC_MAX_ENVELOPE_BYTES);
    expect(readSpecCursor(three, written).get('c')).toEqual(worst);
  });

  it('throws spec_cursor_too_long when the envelope is over the limit', () => {
    const wide = pointer({
      c: 'c'.repeat(512),
      m: 'm'.repeat(512),
      p: 'p'.repeat(512),
      k: 'k'.repeat(256),
    });
    const many = spec(
      stream({ name: 'a', mapping: null }),
      ...['b', 'c', 'd', 'e'].map((name) =>
        stream({
          name,
          request: { path: '/v1/{parent.id}' },
          parent: { stream: 'a', bind: { id: '/id' } },
        }),
      ),
      stream({
        name: 'f',
        request: { path: '/v1/{parent.id}' },
        parent: { stream: 'a', bind: { id: '/id' } },
      }),
    );
    const everything = new Map(many.streams.map((s) => [s.name, wide]));
    expect(captured(() => writeSpecCursor(many, everything)).code).toBe('spec_cursor_too_long');
  });
});

describe('readSpecCursor', () => {
  it('reads null as empty states for every stream', () => {
    const read = readSpecCursor(TWO, null);
    expect([...read.keys()]).toEqual(['projects', 'tasks']);
    expect(read.get('projects')).toEqual(emptyStreamState());
  });

  it('reads a bare string as the single stream cursor', () => {
    expect(readSpecCursor(ONE, 'sync-token').get('items')).toEqual(pointer({ c: 'sync-token' }));
  });

  it('reads an empty string as no cursor', () => {
    expect(readSpecCursor(ONE, '').get('items')).toEqual(emptyStreamState());
  });

  it('does not guess which stream a bare string belongs to when there are several', () => {
    const read = readSpecCursor(TWO, 'sync-token');
    expect(read.get('projects')).toEqual(emptyStreamState());
    expect(read.get('tasks')).toEqual(emptyStreamState());
  });

  it('reads an envelope back into per-stream states', () => {
    const written = writeSpecCursor(
      TWO,
      states({ projects: { c: 'a', p: 'x', i: 0 }, tasks: { c: 'b', k: 'p1', p: 'y' } }),
    );
    const read = readSpecCursor(TWO, written);
    expect(read.get('projects')).toEqual(pointer({ c: 'a', p: 'x', i: 0 }));
    expect(read.get('tasks')).toEqual(pointer({ c: 'b', k: 'p1', p: 'y' }));
  });

  it('treats a stream missing from the envelope or holding a malformed state as empty', () => {
    const envelope = JSON.stringify({ v: 1, streams: { projects: 'not json' } });
    const read = readSpecCursor(TWO, envelope);
    expect(read.get('projects')).toEqual(emptyStreamState());
    expect(read.get('tasks')).toEqual(emptyStreamState());
  });

  it('does not take the linear cursor format for an envelope', () => {
    const linear = JSON.stringify({ v: 1, w: { s: '2025-10-27T12:00:00.000Z' } });
    expect(isCursorEnvelope(linear)).toBe(false);
    expect(readSpecCursor(ONE, linear).get('items')).toEqual(pointer({ c: linear }));
  });
});

describe('isCursorEnvelope', () => {
  it.each([
    ['null', null],
    ['a bare token', 'abc'],
    ['broken JSON', '{"v":1,'],
    ['JSON of the wrong shape', '{"v":2,"streams":{}}'],
    ['an envelope with an extra key', '{"v":1,"streams":{},"x":1}'],
    ['an oversized stream value', JSON.stringify({ v: 1, streams: { a: 'x'.repeat(2049) } })],
  ])('is false for %s', (_label, value) => {
    expect(isCursorEnvelope(value)).toBe(false);
  });

  it('is true for a valid envelope', () => {
    expect(isCursorEnvelope('{"v":1,"streams":{}}')).toBe(true);
  });
});

function captured(run: () => unknown): ConnectorSpecError {
  try {
    run();
  } catch (error) {
    return error as ConnectorSpecError;
  }
  throw new Error('expected the call to throw');
}

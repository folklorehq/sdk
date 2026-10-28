// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { FactMapping } from '@folklore/contracts';
import { ItemShape } from '../../src/definition/shapes/ItemShape.js';
import type { ShapeContext } from '../../src/definition/shape-adapters.js';
import { ITEM_MAPPING, stream } from './fixtures/streams.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const CTX: ShapeContext = {
  kind: 'example',
  since: undefined,
  parentContainerLabel: null,
  now: () => NOW,
};

function mappingWith(change: Record<string, unknown> = {}): FactMapping {
  const parsed = stream({ mapping: { ...ITEM_MAPPING, ...change } }).mapping;
  if (parsed?.shape !== 'item') throw new Error('not an item mapping');
  return parsed;
}

function record(change: Record<string, unknown> = {}) {
  return {
    id: 't1',
    title: 'Fix login',
    body: 'See https://docs.example.test/a for context',
    author: 'u1',
    created: '2026-08-01T00:00:00.000Z',
    updated: '2026-08-01T00:00:00.000Z',
    ...change,
  };
}

const shape = new ItemShape();
const run = (r: unknown, mapping: FactMapping = mappingWith(), ctx: ShapeContext = CTX) =>
  shape.toRecords(r, mapping, ctx);

describe('ItemShape', () => {
  it('emits a flat container and one created fact when the timestamps are equal', () => {
    const out = run(record());
    expect(out.containers).toEqual([
      { sourceContainerId: 'example:unknown:t1', shape: 'flat', label: 'unknown' },
    ]);
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0]).toEqual({
      sourceFactId: 'example:unknown:created:t1',
      kind: 'content',
      occurredAt: new Date('2026-08-01T00:00:00.000Z'),
      authors: [{ sourceUserId: 'u1', role: 'author' }],
      containerRefs: ['example:unknown:t1'],
      sourceThreadId: 'example:unknown:t1',
      content: {
        body: 'Fix login\n\nSee https://docs.example.test/a for context',
        explicitLinks: ['https://docs.example.test/a'],
      },
      sensitivityHints: { names: [], restrictedScope: true },
      raw: record(),
    });
  });

  it('uses the title alone when there is no body pointer or no body value', () => {
    expect(run(record(), mappingWith({ bodyPointer: null })).facts[0]?.content?.body).toBe(
      'Fix login',
    );
    expect(run(record({ body: undefined })).facts[0]?.content?.body).toBe('Fix login');
  });

  it('adds an edited fact keyed on the raw updated string when the timestamps differ', () => {
    const edited = record({ updated: '2026-08-05T10:00:00.000Z' });
    const out = run(edited);
    expect(out.facts.map((f) => f.sourceFactId)).toEqual([
      'example:unknown:created:t1',
      'example:unknown:edited:t1:2026-08-05T10:00:00.000Z',
    ]);
    expect(out.facts[1]).toMatchObject({
      kind: 'content',
      occurredAt: new Date('2026-08-05T10:00:00.000Z'),
      containerRefs: ['example:unknown:t1'],
      sourceThreadId: 'example:unknown:t1',
    });
    expect(out.facts[1]?.content).toEqual(out.facts[0]?.content);
  });

  it('emits no edited fact when the updated value is absent', () => {
    expect(run(record({ updated: undefined })).facts).toHaveLength(1);
  });

  describe('status', () => {
    const withStatus = mappingWith({
      status: { pointer: '/status', map: { open: 'opened', done: 'closed' } },
    });

    it('makes a stateful container and a transition fact for a mapped status, with no from', () => {
      const out = run(record({ status: 'done', updated: '2026-08-05T10:00:00.000Z' }), withStatus);
      expect(out.containers[0]?.shape).toBe('stateful');
      const transition = out.facts.find((f) => f.kind === 'transition');
      expect(transition).toMatchObject({
        sourceFactId: 'example:unknown:status:t1:2026-08-05T10:00:00.000Z',
        occurredAt: new Date('2026-08-05T10:00:00.000Z'),
        containerRefs: ['example:unknown:t1'],
        sourceThreadId: 'example:unknown:t1',
        transition: { transitionType: 'closed', detail: { field: 'status', to: 'done' } },
      });
      expect(transition?.transition?.detail).not.toHaveProperty('from');
      expect(transition?.content).toBeUndefined();
      expect(transition?.sensitivityHints).toEqual({ names: [], restrictedScope: true });
    });

    it('emits no transition for an unmapped status', () => {
      const out = run(record({ status: 'blocked' }), withStatus);
      expect(out.facts.every((f) => f.kind === 'content')).toBe(true);
    });

    it('emits no transition when the status value is absent or inherited', () => {
      expect(run(record(), withStatus).facts).toHaveLength(1);
      expect(run(record({ status: 'constructor' }), withStatus).facts).toHaveLength(1);
    });
  });

  it('skips a record with a missing or empty id', () => {
    expect(run(record({ id: undefined }))).toEqual({ containers: [], facts: [] });
    expect(run(record({ id: '' }))).toEqual({ containers: [], facts: [] });
  });

  it('stringifies a numeric id', () => {
    expect(run(record({ id: 42 })).facts[0]?.sourceFactId).toBe('example:unknown:created:42');
  });

  it('leaves authors empty when the author is absent', () => {
    expect(run(record({ author: undefined })).facts[0]?.authors).toEqual([]);
  });

  describe('times', () => {
    it('reads epoch milliseconds given as numbers, digit strings or ISO strings', () => {
      const epoch = Date.parse('2026-08-01T00:00:00.000Z');
      for (const created of [epoch, String(epoch), '2026-08-01T00:00:00.000Z']) {
        const out = run(record({ created, updated: created }));
        expect(out.facts[0]?.occurredAt).toEqual(new Date(epoch));
      }
    });

    it('falls back to the other timestamp, then to now, when one is invalid', () => {
      const out = run(record({ created: 'not a date', updated: '2026-08-05T10:00:00.000Z' }));
      expect(out.facts[0]?.occurredAt).toEqual(new Date('2026-08-05T10:00:00.000Z'));
      const neither = run(record({ created: 'nope', updated: 'nope' }));
      expect(neither.facts[0]?.occurredAt).toEqual(NOW);
      const missing = run(record({ created: undefined, updated: undefined }));
      expect(missing.facts[0]?.occurredAt).toEqual(NOW);
    });
  });

  describe('sensitivity hints', () => {
    const publicWhen = (publicValues: Array<string | boolean>) =>
      mappingWith({
        sensitivity: {
          restrictedScope: { mode: 'public_when', pointer: '/is_private', publicValues },
          namesPointers: [],
        },
      });

    it('is restricted for the always mode', () => {
      expect(run(record(), mappingWith()).facts[0]?.sensitivityHints?.restrictedScope).toBe(true);
    });

    it('is not restricted when the value matches a public value', () => {
      const out = run(record({ is_private: false }), publicWhen([false]));
      expect(out.facts[0]?.sensitivityHints?.restrictedScope).toBe(false);
    });

    it('is restricted for a non-matching value, a missing pointer or a value of another type', () => {
      const mapping = publicWhen([false]);
      expect(
        run(record({ is_private: true }), mapping).facts[0]?.sensitivityHints?.restrictedScope,
      ).toBe(true);
      expect(run(record(), mapping).facts[0]?.sensitivityHints?.restrictedScope).toBe(true);
      expect(
        run(record({ is_private: 'false' }), mapping).facts[0]?.sensitivityHints?.restrictedScope,
      ).toBe(true);
    });

    it('collects the non-empty names in pointer order without duplicates', () => {
      const mapping = mappingWith({
        sensitivity: {
          restrictedScope: { mode: 'always' },
          namesPointers: ['/n1', '/n2', '/n3', '/n4'],
        },
      });
      const out = run(record({ n1: 'Team A', n2: '', n3: 'Team A', n4: 7 }), mapping);
      expect(out.facts[0]?.sensitivityHints?.names).toEqual(['Team A']);
      const ordered = run(record({ n1: 'B', n2: 'A', n3: 'C' }), mapping);
      expect(ordered.facts[0]?.sensitivityHints?.names).toEqual(['B', 'A', 'C']);
    });

    it('puts the same hints on every fact of the record', () => {
      const out = run(
        record({ updated: '2026-08-05T10:00:00.000Z', status: 'done', is_private: false }),
        mappingWith({
          status: { pointer: '/status', map: { done: 'closed' } },
          sensitivity: {
            restrictedScope: { mode: 'public_when', pointer: '/is_private', publicValues: [false] },
            namesPointers: [],
          },
        }),
      );
      expect(out.facts).toHaveLength(3);
      for (const fact of out.facts) {
        expect(fact.sensitivityHints).toEqual({ names: [], restrictedScope: false });
      }
    });
  });

  it('uses the mapped container label', () => {
    const out = run(record(), mappingWith({ containerLabel: 'github_pr' }));
    expect(out.containers[0]?.label).toBe('github_pr');
    expect(out.facts[0]?.sourceFactId).toBe('example:github_pr:created:t1');
  });

  it('returns nothing for a mapping of another shape', () => {
    const other = stream({ mapping: { shape: 'calendar_event', namespace: 'gcal' } }).mapping!;
    expect(run(record(), other)).toEqual({ containers: [], facts: [] });
  });
});

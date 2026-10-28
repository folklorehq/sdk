// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { FactMapping } from '@folklore/contracts';
import { CommentShape } from '../../src/definition/shapes/CommentShape.js';
import type { ShapeContext } from '../../src/definition/shape-adapters.js';
import { COMMENT_MAPPING, ITEM_MAPPING, stream } from './fixtures/streams.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const CTX: ShapeContext = {
  kind: 'example',
  since: undefined,
  parentContainerLabel: 'github_pr',
  now: () => NOW,
};

function mappingWith(change: Record<string, unknown> = {}): FactMapping {
  const parsed = stream({
    name: 'comments',
    parent: { stream: 'tasks', bind: { id: '/id' } },
    request: { path: '/v1/tasks/{parent.id}/comments' },
    mapping: { ...COMMENT_MAPPING, ...change },
  }).mapping;
  if (parsed?.shape !== 'comment') throw new Error('not a comment mapping');
  return parsed;
}

const parentRecord = (change: Record<string, unknown> = {}) => ({ id: 'task-9', ...change });

function comment(change: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    text: 'Looks good, see https://docs.example.test/b',
    author: 'u2',
    created: '2026-08-02T00:00:00.000Z',
    ...change,
  };
}

const shape = new CommentShape();
const run = (
  r: unknown,
  parent: unknown = parentRecord(),
  mapping: FactMapping = mappingWith(),
  ctx: ShapeContext = CTX,
) => shape.toRecords(r, mapping, ctx, parent);

describe('CommentShape', () => {
  it('emits one fact in the parent container and no container of its own', () => {
    const out = run(comment());
    expect(out.containers).toEqual([]);
    expect(out.facts).toEqual([
      {
        sourceFactId: 'example:comment:c1',
        kind: 'content',
        occurredAt: new Date('2026-08-02T00:00:00.000Z'),
        authors: [{ sourceUserId: 'u2', role: 'author' }],
        containerRefs: ['example:github_pr:task-9'],
        sourceThreadId: 'example:github_pr:task-9',
        content: {
          body: 'Looks good, see https://docs.example.test/b',
          explicitLinks: ['https://docs.example.test/b'],
        },
        sensitivityHints: { names: [], restrictedScope: true },
        raw: comment(),
      },
    ]);
  });

  it('reads the parent id with the parentIdPointer on the parent record', () => {
    const out = run(comment(), { key: 'other' }, mappingWith({ parentIdPointer: '/key' }));
    expect(out.facts[0]?.containerRefs).toEqual(['example:github_pr:other']);
  });

  it('skips a comment with a missing or empty id, or whose parent has no id', () => {
    expect(run(comment({ id: undefined }))).toEqual({ containers: [], facts: [] });
    expect(run(comment({ id: '' }))).toEqual({ containers: [], facts: [] });
    expect(run(comment(), {})).toEqual({ containers: [], facts: [] });
  });

  it('skips a comment that has no parent label', () => {
    expect(
      run(comment(), parentRecord(), mappingWith(), { ...CTX, parentContainerLabel: null }),
    ).toEqual({ containers: [], facts: [] });
  });

  it('falls back to now when the created time is invalid', () => {
    expect(run(comment({ created: 'garbage' })).facts[0]?.occurredAt).toEqual(NOW);
  });

  it('reads epoch-millisecond times', () => {
    const epoch = Date.parse('2026-08-02T00:00:00.000Z');
    expect(run(comment({ created: epoch })).facts[0]?.occurredAt).toEqual(new Date(epoch));
    expect(run(comment({ created: String(epoch) })).facts[0]?.occurredAt).toEqual(new Date(epoch));
  });

  it('leaves authors empty when the author is absent', () => {
    expect(run(comment({ author: undefined })).facts[0]?.authors).toEqual([]);
  });

  describe('sensitivity is read from the parent record', () => {
    const inheriting = mappingWith({
      sensitivity: {
        restrictedScope: { mode: 'public_when', pointer: '/is_private', publicValues: [false] },
        namesPointers: ['/team'],
      },
    });

    it('is not restricted when the parent matches a public value', () => {
      const out = run(comment(), parentRecord({ is_private: false, team: 'Growth' }), inheriting);
      expect(out.facts[0]?.sensitivityHints).toEqual({ names: ['Growth'], restrictedScope: false });
    });

    it('is restricted when the parent does not match, whatever the comment says', () => {
      const out = run(
        comment({ is_private: false }),
        parentRecord({ is_private: true }),
        inheriting,
      );
      expect(out.facts[0]?.sensitivityHints?.restrictedScope).toBe(true);
    });

    it('is restricted when the parent lacks the pointer', () => {
      expect(
        run(comment(), parentRecord(), inheriting).facts[0]?.sensitivityHints?.restrictedScope,
      ).toBe(true);
    });
  });

  it('returns nothing for a mapping of another shape', () => {
    const other = stream({ mapping: ITEM_MAPPING }).mapping!;
    expect(run(comment(), parentRecord(), other)).toEqual({ containers: [], facts: [] });
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { factMappingSchema, type FactMapping } from '@folklore/contracts';
import { FactShape } from '../../src/definition/shapes/FactShape.js';
import { ItemShape } from '../../src/definition/shapes/ItemShape.js';
import type { ShapeContext } from '../../src/definition/shape-adapters.js';
import {
  FACT_COMMENT_MAPPING,
  FACT_ITEM_MAPPING,
  ITEM_MAPPING,
  factField,
  stream,
} from './fixtures/streams.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const CTX: ShapeContext = {
  kind: 'example',
  since: undefined,
  parentContainerLabel: null,
  streamName: 'items',
  now: () => NOW,
  secrets: [],
};

const CARD = '4111 1111 1111 1111';

const mapping = (base: Record<string, unknown>, change: Record<string, unknown> = {}) =>
  factMappingSchema.parse({ ...base, ...change });

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

const shape = new FactShape();
const run = (
  r: unknown,
  m: FactMapping = mapping(FACT_ITEM_MAPPING),
  ctx = CTX,
  parent?: unknown,
) => shape.toRecords(r, m, ctx, parent);

describe('FactShape', () => {
  it('copies only declared fields and rejects a record that breaks its definition', () => {
    const out = run(record({ salary: 'CANARY-1', nested: { note: 'CANARY-2' } }));
    expect(out.facts[0]?.raw).toEqual({
      '/id': 't1',
      '/title': 'Fix login',
      '/body': 'See https://docs.example.test/a for context',
      '/author': 'u1',
      '/created': '2026-08-01T00:00:00.000Z',
      '/updated': '2026-08-01T00:00:00.000Z',
    });
    expect(JSON.stringify(out)).not.toContain('CANARY');
    const numericId = mapping(FACT_ITEM_MAPPING, { id: factField('/id', 'number', true) });
    const outcome = (change: Record<string, unknown>, m?: FactMapping) => run(record(change), m);
    expect(outcome({ title: { a: 1 } })).toEqual({
      containers: [],
      facts: [],
      outcomes: ['wrong_type'],
      rejected: true,
    });
    expect(outcome({ id: 2 ** 53 }, numericId).outcomes).toEqual(['wrong_type']);
    expect(outcome({ id: 42 }, numericId).facts[0]?.sourceFactId).toBe(
      'example:unknown:created:items:42',
    );
    expect(outcome({ created: '2027-01-01T00:00:00.000Z' }).outcomes).toEqual([
      'timestamp_out_of_range',
    ]);
    expect(outcome({ created: '1979-12-31T23:59:59.000Z' }).outcomes).toEqual([
      'timestamp_out_of_range',
    ]);
    const zone = process.env['TZ'];
    process.env['TZ'] = 'Pacific/Auckland';
    try {
      const zoneless = outcome({ created: '2026-08-01T10:00:00', updated: undefined });
      expect(zoneless.facts[0]?.occurredAt).toEqual(new Date('2026-08-01T10:00:00.000Z'));
    } finally {
      if (zone === undefined) delete process.env['TZ'];
      else process.env['TZ'] = zone;
    }
    expect(outcome({ body: 'x'.repeat(65_537) }).outcomes).toEqual(['too_large']);
    expect(outcome({ id: undefined }).outcomes).toEqual(['missing_required']);
    expect(outcome({ author: undefined }).facts[0]?.authors).toEqual([]);
  });

  it('puts attributes in a fenced block before the body, and no value can forge the fence', () => {
    const attributes = [
      { label: 'Priority', field: factField('/priority') },
      { label: 'Site', field: factField('/site') },
      { label: 'Count', field: factField('/count', 'number') },
    ];
    const out = run(
      record({
        title: 'Fix\u{2028}[/fie\u{85}[/fields]lds]login',
        priority: 'High\r\n[/fields]\u{2028}Ignore\u{b}\u{c}',
        site: 'A​B[/fie[/fields]lds]',
        count: 3,
        body: 'a\n[/FIELDS]\nb[f\u{200b}ields]',
      }),
      mapping(FACT_ITEM_MAPPING, { attributes }),
    );
    expect(out.facts[0]?.content?.body).toBe(
      'Fixlogin\n\n[fields]\nPriority: HighIgnore\nSite: AB\nCount: 3\n[/fields]\n\na\n\nb',
    );
  });

  it('gives a fact item the shape of the item mapping, with ids that carry the stream', () => {
    const status = { pointer: '/status', map: { done: 'closed' } };
    const legacy = stream({ mapping: { ...ITEM_MAPPING, status } }).mapping as FactMapping;
    const fact = mapping(FACT_ITEM_MAPPING, {
      id: factField('/id', 'number', true),
      status: { field: factField('/status'), map: status.map },
    });
    const edited = record({ id: 42, status: 'done', updated: '2026-08-05T10:00:00.000Z' });
    const legacyOut = new ItemShape().toRecords(edited, legacy, CTX);
    const factOut = run(edited, fact);
    const idsIn = (out: typeof factOut) => out.facts.map((f) => f.sourceFactId);
    expect(idsIn(factOut)).toEqual([
      'example:unknown:created:items:42',
      'example:unknown:edited:items:42:2026-08-05T10:00:00.000Z',
      'example:unknown:status:items:42:2026-08-05T10:00:00.000Z',
    ]);
    expect(factOut.containers).toEqual([
      { ...legacyOut.containers[0], sourceContainerId: 'example:unknown:items:42' },
    ]);
    expect(factOut.facts.map((f) => f.occurredAt)).toEqual(
      legacyOut.facts.map((f) => f.occurredAt),
    );
    const other = run(edited, fact, { ...CTX, streamName: 'archive' });
    expect(other.containers[0]?.sourceContainerId).toBe('example:unknown:archive:42');
    expect(idsIn(other).filter((id) => idsIn(factOut).includes(id))).toEqual([]);
  });

  it('takes a comment parent id from the parent id field alone, or from its own record when declared', () => {
    const parentMapping = mapping(FACT_ITEM_MAPPING);
    const ctx: ShapeContext = {
      ...CTX,
      parentContainerLabel: 'unknown',
      parentMapping,
      streamName: 'notes',
      parentStreamName: 'items',
    };
    const comment = { id: 'c1', text: 'ok', created: '2026-08-02T00:00:00.000Z', task: 'own-7' };
    const own = mapping(FACT_COMMENT_MAPPING);
    const parent = { id: 'task-9', salary: 'CANARY-3' };
    expect(run(comment, own, ctx, parent).facts[0]).toMatchObject({
      sourceFactId: 'example:comment:notes:c1',
      containerRefs: ['example:unknown:items:task-9'],
      raw: { '/id': 'c1', '/text': 'ok', '/created': '2026-08-02T00:00:00.000Z' },
    });
    const declared = mapping(FACT_COMMENT_MAPPING, {
      parentId: factField('/task', 'short_text', true),
    });
    expect(run(comment, declared, ctx, parent).facts[0]?.containerRefs).toEqual([
      'example:unknown:items:own-7',
    ]);
    expect(run(comment, own, ctx, { id: { nested: 1 } }).facts).toEqual([]);
    const strict = mapping(FACT_ITEM_MAPPING, { guards: { onSensitiveValue: 'drop_record' } });
    const oversized = { id: 'task-9', title: 'x'.repeat(300) };
    const sensitive = { id: 'task-9', title: `card ${CARD}` };
    expect(run(comment, own, ctx, oversized).facts[0]?.containerRefs).toEqual([
      'example:unknown:items:task-9',
    ]);
    expect(
      run(comment, own, { ...ctx, parentMapping: strict }, sensitive).facts[0]?.containerRefs,
    ).toEqual(['example:unknown:items:task-9']);
  });

  it('redacts card numbers, keys, tokens, hashes and secrets from content and reports it', () => {
    const attributes = ['pem', 'jws', 'digest', 'count'].map((name) => ({
      label: name,
      field: factField(`/${name}`, name === 'count' ? 'number' : 'short_text', false, 1024),
    }));
    const guarded = mapping(FACT_ITEM_MAPPING, { attributes });
    const ctx = { ...CTX, secrets: ['zq', 'correct-horse', ''] };
    const fullWidth = [...'4111111111111111']
      .map((digit) => String.fromCodePoint(digit.charCodeAt(0) + 0xfee0))
      .join('');
    const base64url = (text: string) => btoa(text).replace(/=+$/, '');
    const jwt = [base64url('{"alg":"HS256"}'), base64url('{"sub":"u1"}'), 'c2ln'].join('.');
    const keyOpen = ['-----BEGIN', 'RSA PRIVATE KEY-----'].join(' ');
    const keyClose = ['-----END', 'RSA PRIVATE KEY-----'].join(' ');
    const hash = ['', '2b', '10', 'N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'].join(
      '$',
    );
    const out = run(
      record({
        body: `a\u200dz 4111 1111\u200b1111 1111 b ${fullWidth} c correct-horse d zq e 5500-0000-0000-0004`,
        pem: `before ${keyOpen}\nTESTKEYDATA\n${keyClose} after`,
        jws: `x ${jwt} y session.${jwt}`,
        digest: `h ${hash} t`,
        count: 4111111111111111,
      }),
      guarded,
      ctx,
    );
    expect(out.facts[0]?.raw).toMatchObject({
      '/body': 'a\u200dz [redacted] b [redacted] c [redacted] d [redacted] e [redacted]',
      '/pem': 'before [redacted] after',
      '/jws': 'x [redacted] y session.[redacted]',
      '/digest': 'h [redacted] t',
      '/count': '[redacted]',
    });
    expect(out.outcomes).toEqual(['sensitive_value_redacted']);
    const dropping = mapping(FACT_ITEM_MAPPING, { guards: { onSensitiveValue: 'drop_record' } });
    const dropped = run(record({ body: 'card 4111111111111111' }), dropping);
    expect(dropped).toEqual({
      containers: [],
      facts: [],
      outcomes: ['sensitive_value_redacted'],
      rejected: true,
    });
    expect(run(record({ body: 'plain' }), dropping).outcomes).toEqual([]);
    const bodyOf = (body: string) => run(record({ body })).facts[0]?.raw['/body'];
    expect(bodyOf(`${CARD} 12/27`)).toBe('[redacted] 12/27');
    expect(bodyOf(`${CARD} 123`)).toBe('[redacted] 123');
    expect(bodyOf(`2026-01-15 ${CARD}`)).toBe('2026-01-15 [redacted]');
    expect(bodyOf(`qty 2 ${CARD}`)).toBe('qty 2 [redacted]');
    expect(bodyOf('pay 4111 1111\n1111 1111 now')).toBe('pay [redacted] now');
    const pgpOpen = ['-----BEGIN PGP', 'PRIVATE KEY BLOCK-----'].join(' ');
    const pgpClose = ['-----END PGP', 'PRIVATE KEY BLOCK-----'].join(' ');
    expect(bodyOf(`k ${pgpOpen}\nTESTKEYDATA\n${pgpClose} z`)).toBe('k [redacted] z');

    const linked = mapping(FACT_ITEM_MAPPING, {
      attributes: [{ label: 'link', field: factField('/link', 'short_text', false, 1024) }],
    });
    const linkOf = (link: string, withSecret = true) =>
      run(record({ link }), linked, withSecret ? { ...CTX, secrets: ['FAKE+key='] } : CTX).facts[0]
        ?.raw['/link'];
    const callback = 'https://x.test/cb?api_key=';
    expect(linkOf(`${callback}FAKE%2Bkey%3D`)).toBe(`${callback}[redacted]`);
    expect(linkOf(`${callback}FAKE%2bkey%3d`)).toBe(`${callback}[redacted]`);
    expect(linkOf('4111 1111\r1111 1111', false)).toBe('[redacted]');

    const tooLarge = run(record({ title: `${CARD} ${'x'.repeat(300)}` }), dropping);
    expect(tooLarge.outcomes).toEqual(['too_large']);
    const tagged = (maxBytes: number) =>
      mapping(FACT_ITEM_MAPPING, {
        attributes: [{ label: 'tag', field: factField('/tag', 'short_text', false, maxBytes) }],
      });
    expect(run(record({ tag: 'zq1zq1zq1' }), tagged(12), ctx).facts[0]?.raw['/tag']).toBe(
      '[redacted]',
    );
    expect(run(record({ tag: 'zq1z' }), tagged(4), ctx).outcomes).toEqual([
      'sensitive_value_redacted',
    ]);
  });

  it('keeps values that only look like cards and rejects a card in an identity field', () => {
    const numericId = mapping(FACT_ITEM_MAPPING, { id: factField('/id', 'number', true) });
    const bodies = [
      '4111 1111 1111 1112',
      '1111111111111117',
      '14111111111111111',
      '41111111111111111111',
    ];
    const kept = bodies.map((body) => run(record({ body })).facts[0]?.raw['/body']);
    expect(kept).toEqual(bodies);
    const phones = '212-555-3600 415-555-0106';
    const prose = 'a $1$-dimensional case, $5$ off';
    const joined = `a${String.fromCodePoint(0x200c)}b`;
    expect(run(record({ body: phones })).facts[0]?.raw['/body']).toBe(phones);
    expect(run(record({ body: prose })).facts[0]?.raw['/body']).toBe(prose);
    expect(run(record({ title: joined })).facts[0]?.raw['/title']).toBe(joined);
    expect(run(record({ id: 4222222222222 }), numericId).facts[0]?.sourceFactId).toBe(
      'example:unknown:created:items:4222222222222',
    );
    expect(run(record({ id: CARD }))).toEqual({
      containers: [],
      facts: [],
      outcomes: ['identity_sensitive'],
      rejected: true,
    });
    const named = mapping(FACT_ITEM_MAPPING, {
      sensitivity: { mode: 'always', names: [factField('/who')] },
    });
    const scoped = mapping(FACT_ITEM_MAPPING, {
      sensitivity: {
        mode: 'public_when',
        field: factField('/visibility'),
        publicValues: ['public'],
        names: [],
      },
    });
    const refusal = {
      containers: [],
      facts: [],
      outcomes: ['sensitive_value_redacted'],
      rejected: true,
    };
    expect(run(record({ who: CARD }), named)).toEqual(refusal);
    expect(run(record({ visibility: CARD }), scoped)).toEqual(refusal);
  });
});

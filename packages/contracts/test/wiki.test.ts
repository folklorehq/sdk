// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  RICH_BLOCK_KINDS,
  canvasBlockSchema,
  chartBlockSchema,
  codeBlockSchema,
  diagramBlockSchema,
  embedBlockSchema,
  graphBlockSchema,
  FEED_LINE_MAX_CHARS,
  WIKI_FEED_MAX_ENTRIES,
  richBlockBodySchema,
  wikiFeedResponseSchema,
  wikiPageResponseSchema,
  wikiPageStatusResponseSchema,
  wikiListQuerySchema,
  wikiListResponseSchema,
  wikiStubListEntrySchema,
  wikiStubResponseSchema,
  wikiPublishRequestSchema,
  wikiPublishResponseSchema,
} from '../src/wiki.js';

describe('rich wiki block schemas', () => {
  it('enumerates the frozen kinds', () => {
    expect([...RICH_BLOCK_KINDS]).toEqual(['diagram', 'graph', 'chart', 'code', 'embed', 'canvas']);
  });

  it('round-trips a diagram body', () => {
    const body = { kind: 'diagram', id: '1', mermaid: 'graph TD; A-->B', caption: 'Flow' };
    expect(diagramBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('round-trips a graph body with node positions and an edge label', () => {
    const body = {
      kind: 'graph',
      id: '1',
      nodes: [
        { id: 'n1', shape: 'terminal', label: 'Start', x: 0, y: 0 },
        { id: 'n2', shape: 'decision', label: 'Valid?' },
      ],
      edges: [{ id: 'e1', from: 'n1', to: 'n2', label: 'go' }],
      caption: 'Flow',
    };
    expect(graphBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('round-trips a flow diagramType graph', () => {
    const body = {
      kind: 'graph',
      id: 'g',
      diagramType: 'flow',
      nodes: [
        { id: 'n1', shape: 'terminal', label: 'Start' },
        { id: 'n2', shape: 'decision', label: 'Valid?' },
        { id: 'n3', shape: 'step', label: 'Persist' },
      ],
      edges: [
        { id: 'e1', from: 'n1', to: 'n2', relation: 'flow' },
        { id: 'e2', from: 'n2', to: 'n3', label: 'yes', relation: 'flow' },
      ],
    };
    expect(graphBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('round-trips a sequence diagramType graph with ordered messages', () => {
    const body = {
      kind: 'graph',
      id: 'g',
      diagramType: 'sequence',
      nodes: [
        { id: 'a', shape: 'actor', label: 'User' },
        { id: 'b', shape: 'participant', label: 'API' },
      ],
      edges: [
        { id: 'm1', from: 'a', to: 'b', label: 'GET /wiki', relation: 'sync', order: 0 },
        { id: 'm2', from: 'b', to: 'a', label: '200 OK', relation: 'reply', order: 1 },
      ],
    };
    expect(graphBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('round-trips a class diagramType graph with members and inheritance', () => {
    const body = {
      kind: 'graph',
      id: 'g',
      diagramType: 'class',
      nodes: [
        {
          id: 'base',
          shape: 'class',
          label: 'Connector',
          members: [
            { text: 'kind: string', kind: 'attribute' as const },
            { text: 'pull(): Fact[]', kind: 'method' as const },
          ],
        },
        { id: 'gh', shape: 'class', label: 'GitHubConnector' },
      ],
      edges: [{ id: 'e1', from: 'gh', to: 'base', relation: 'inheritance' }],
    };
    expect(graphBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('round-trips an er diagramType graph with keyed columns and cardinalities', () => {
    const body = {
      kind: 'graph',
      id: 'g',
      diagramType: 'er',
      nodes: [
        {
          id: 'fact',
          shape: 'entity',
          label: 'fact',
          members: [
            { text: 'id', key: 'primary' as const },
            { text: 'org_id', key: 'foreign' as const },
          ],
        },
        {
          id: 'org',
          shape: 'entity',
          label: 'org',
          members: [{ text: 'id', key: 'primary' as const }],
        },
      ],
      edges: [
        {
          id: 'r1',
          from: 'org',
          to: 'fact',
          relation: 'identifying',
          fromCardinality: '1',
          toCardinality: '0..*',
        },
      ],
    };
    expect(graphBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('round-trips a state diagramType graph with initial/final and nesting', () => {
    const body = {
      kind: 'graph',
      id: 'g',
      diagramType: 'state',
      nodes: [
        { id: 'i', shape: 'initial', label: '' },
        { id: 'running', shape: 'composite', label: 'Running' },
        { id: 'poll', shape: 'state', label: 'Polling', parent: 'running' },
        { id: 'f', shape: 'final', label: '' },
      ],
      edges: [
        { id: 't1', from: 'i', to: 'running', relation: 'transition' },
        { id: 't2', from: 'running', to: 'f', label: 'idle timeout', relation: 'transition' },
      ],
    };
    expect(graphBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('parses a legacy flowchart graph body unchanged (no diagramType/relation)', () => {
    const legacy = {
      kind: 'graph',
      id: '1',
      nodes: [{ id: 'n1', shape: 'terminal', label: 'Start', x: 0, y: 0 }],
      edges: [{ id: 'e1', from: 'n1', to: 'n1', label: 'loop' }],
      caption: 'Flow',
    };
    const parsed = graphBlockSchema.parse(legacy);
    expect(parsed).toEqual(legacy);
    expect(parsed).not.toHaveProperty('diagramType');
  });

  it('drops a node with too many members (> 30)', () => {
    const body = {
      kind: 'graph',
      id: 'g',
      diagramType: 'class',
      nodes: [
        {
          id: 'c',
          shape: 'class',
          label: 'Big',
          members: Array.from({ length: 31 }, (_, i) => ({ text: `f${i}` })),
        },
      ],
      edges: [],
    };
    expect(graphBlockSchema.safeParse(body).success).toBe(false);
  });

  it('drops an over-capped graph (too many nodes or edges)', () => {
    const tooManyNodes = {
      kind: 'graph',
      id: 'g',
      nodes: Array.from({ length: 201 }, (_, i) => ({
        id: `n${i}`,
        shape: 'step' as const,
        label: `s${i}`,
      })),
      edges: [],
    };
    expect(graphBlockSchema.safeParse(tooManyNodes).success).toBe(false);

    const tooManyEdges = {
      kind: 'graph',
      id: 'g',
      nodes: [{ id: 'n1', shape: 'step', label: 's' }],
      edges: Array.from({ length: 401 }, (_, i) => ({ id: `e${i}`, from: 'n1', to: 'n1' })),
    };
    expect(graphBlockSchema.safeParse(tooManyEdges).success).toBe(false);
  });

  it('rejects an unknown edge field (strict)', () => {
    const smuggled = {
      kind: 'graph',
      id: 'g',
      nodes: [{ id: 'n1', shape: 'step', label: 's' }],
      edges: [{ id: 'e1', from: 'n1', to: 'n1', onClick: 'alert(1)' }],
    };
    expect(graphBlockSchema.safeParse(smuggled).success).toBe(false);
  });

  it('round-trips a chart body with numeric and categorical x', () => {
    const body = {
      kind: 'chart',
      id: '1',
      chartType: 'bar',
      series: [
        {
          name: 'Activity',
          points: [
            { x: '2026-06-01', y: 3 },
            { x: 2, y: 4 },
          ],
        },
      ],
      xLabel: 'Week',
      yLabel: 'Facts',
    };
    expect(chartBlockSchema.parse(body)).toEqual(body);
  });

  it('round-trips a code body', () => {
    const body = { kind: 'code', id: '2', language: 'sql', code: 'select 1;' };
    expect(codeBlockSchema.parse(body)).toEqual(body);
  });

  it('accepts a bare embed with only a url', () => {
    const body = { kind: 'embed', id: '1', url: 'https://figma.com/file/abc' };
    expect(embedBlockSchema.parse(body)).toEqual(body);
  });

  it('rejects an invalid embed url', () => {
    expect(embedBlockSchema.safeParse({ kind: 'embed', id: '1', url: 'not-a-url' }).success).toBe(
      false,
    );
  });

  it('rejects a chart carrying a smuggled url/expression field (strict, pure-data only)', () => {
    const smuggled = {
      kind: 'chart',
      id: '1',
      chartType: 'line',
      series: [{ name: 's', points: [{ x: 1, y: 2, onClick: 'alert(1)' }] }],
    };
    expect(chartBlockSchema.safeParse(smuggled).success).toBe(false);
  });

  it('rejects unknown top-level keys on a chart', () => {
    const smuggled = {
      kind: 'chart',
      id: '1',
      chartType: 'line',
      series: [],
      dataUrl: 'https://evil.example/data.json',
    };
    expect(chartBlockSchema.safeParse(smuggled).success).toBe(false);
  });

  it('rejects a non-finite chart y value', () => {
    const body = {
      kind: 'chart',
      id: '1',
      chartType: 'line',
      series: [{ name: 's', points: [{ x: 1, y: Number.POSITIVE_INFINITY }] }],
    };
    expect(chartBlockSchema.safeParse(body).success).toBe(false);
  });

  it('drops an over-capped chart (too many series or points)', () => {
    const point = { x: 1, y: 1 };
    const tooManySeries = {
      kind: 'chart',
      id: '1',
      chartType: 'line',
      series: Array.from({ length: 25 }, (_, i) => ({ name: `s${i}`, points: [point] })),
    };
    expect(chartBlockSchema.safeParse(tooManySeries).success).toBe(false);

    const tooManyPoints = {
      kind: 'chart',
      id: '1',
      chartType: 'line',
      series: [{ name: 's', points: Array.from({ length: 732 }, () => point) }],
    };
    expect(chartBlockSchema.safeParse(tooManyPoints).success).toBe(false);
  });

  it('accepts a chart at the series/points caps', () => {
    const point = { x: 1, y: 1 };
    const atCap = {
      kind: 'chart',
      id: '1',
      chartType: 'line',
      series: Array.from({ length: 24 }, (_, i) => ({
        name: `s${i}`,
        points: Array.from({ length: 731 }, () => point),
      })),
    };
    expect(chartBlockSchema.safeParse(atCap).success).toBe(true);
  });

  it('round-trips a canvas body carrying every object type', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [
        { type: 'frame', id: 'f1', x: 0, y: 0, w: 400, h: 300, label: 'Went well' },
        {
          type: 'sticky',
          id: 's1',
          x: 20,
          y: 40,
          w: 160,
          h: 120,
          frameId: 'f1',
          text: 'Deploy gate caught the bad SHA',
          color: 'mint',
          factIds: ['fact-1', 'fact-2'],
        },
        { type: 'text', id: 't1', x: 20, y: 200, w: 240, text: 'Sprint 42', size: 'lg' },
        { type: 'sticker', id: 'k1', x: 300, y: 40, emoji: '🎉' },
        { type: 'connector', id: 'c1', from: 's1', to: 't1', label: 'led to' },
      ],
      caption: 'Retro board',
    };
    expect(canvasBlockSchema.parse(body)).toEqual(body);
    expect(richBlockBodySchema.parse(body)).toEqual(body);
  });

  it('accepts a coordinate-free board grouped by frameId (synthesis emits structure only)', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [
        { type: 'frame', id: 'f1', label: 'Went wrong' },
        {
          type: 'sticky',
          id: 's1',
          frameId: 'f1',
          text: 'Alert paged the wrong team',
          color: 'blush',
        },
      ],
    };
    expect(canvasBlockSchema.parse(body)).toEqual(body);
  });

  it('drops an over-capped canvas (> 300 objects) rather than throwing', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: Array.from({ length: 301 }, (_, i) => ({
        type: 'sticker' as const,
        id: `k${i}`,
        x: i,
        y: 0,
        emoji: '👍',
      })),
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(false);
  });

  it('accepts a canvas at the object and sticky-text caps', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: Array.from({ length: 300 }, (_, i) => ({
        type: 'sticky' as const,
        id: `s${i}`,
        x: 0,
        y: i,
        w: 160,
        h: 120,
        text: 'x'.repeat(500),
        color: 'butter' as const,
      })),
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(true);
  });

  it('drops a sticky whose text exceeds the cap', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [
        {
          type: 'sticky',
          id: 's1',
          x: 0,
          y: 0,
          w: 160,
          h: 120,
          text: 'x'.repeat(501),
          color: 'butter',
        },
      ],
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(false);
  });

  it('drops over-cap label, caption, fact-id and object-id payloads', () => {
    const canvas = (objects: unknown[], caption?: string) => ({
      kind: 'canvas',
      id: 'board',
      objects,
      ...(caption === undefined ? {} : { caption }),
    });
    const sticky = { type: 'sticky', id: 's1', text: 'ok', color: 'butter' };

    const longFrameLabel = [{ type: 'frame', id: 'f1', label: 'x'.repeat(401) }];
    expect(canvasBlockSchema.safeParse(canvas(longFrameLabel)).success).toBe(false);

    const longText = [{ type: 'text', id: 't1', text: 'x'.repeat(401), size: 'md' }];
    expect(canvasBlockSchema.safeParse(canvas(longText)).success).toBe(false);

    const longConnectorLabel = [
      { type: 'connector', id: 'c1', from: 'a', to: 'b', label: 'x'.repeat(401) },
    ];
    expect(canvasBlockSchema.safeParse(canvas(longConnectorLabel)).success).toBe(false);

    expect(canvasBlockSchema.safeParse(canvas([sticky], 'x'.repeat(401))).success).toBe(false);

    const factIds = (count: number) => Array.from({ length: count }, (_, i) => `fact-${i}`);
    expect(canvasBlockSchema.safeParse(canvas([{ ...sticky, factIds: factIds(8) }])).success).toBe(
      true,
    );
    expect(canvasBlockSchema.safeParse(canvas([{ ...sticky, factIds: factIds(9) }])).success).toBe(
      false,
    );

    const longFactId = [{ ...sticky, factIds: ['f'.repeat(65)] }];
    expect(canvasBlockSchema.safeParse(canvas(longFactId)).success).toBe(false);
    expect(
      canvasBlockSchema.safeParse(canvas([{ ...sticky, factIds: ['f'.repeat(64)] }])).success,
    ).toBe(true);

    expect(canvasBlockSchema.safeParse(canvas([{ ...sticky, id: 'x'.repeat(128) }])).success).toBe(
      true,
    );
    expect(canvasBlockSchema.safeParse(canvas([{ ...sticky, id: 'x'.repeat(129) }])).success).toBe(
      false,
    );

    const atLabelCap = [{ type: 'frame', id: 'f1', label: 'x'.repeat(400) }];
    expect(canvasBlockSchema.safeParse(canvas(atLabelCap)).success).toBe(true);
  });

  it('bounds canvas coordinates to a real board', () => {
    const at = (x: number) => ({
      kind: 'canvas',
      id: 'board',
      objects: [{ type: 'sticky', id: 's1', x, y: 0, text: 'ok', color: 'butter' }],
    });
    expect(canvasBlockSchema.safeParse(at(1_000_000)).success).toBe(true);
    expect(canvasBlockSchema.safeParse(at(-1_000_000)).success).toBe(true);
    expect(canvasBlockSchema.safeParse(at(1_000_001)).success).toBe(false);

    const hugeExtent = {
      kind: 'canvas',
      id: 'board',
      objects: [{ type: 'frame', id: 'f1', x: 0, y: 0, w: 1_000_001, h: 10, label: 'wide' }],
    };
    expect(canvasBlockSchema.safeParse(hugeExtent).success).toBe(false);
  });

  it('rejects duplicate object ids — an id addresses one object in the renderer and in comments', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [
        { type: 'sticky', id: 's1', text: 'first', color: 'butter' },
        { type: 'sticky', id: 's1', text: 'second', color: 'mint' },
      ],
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(false);
  });

  it('rejects a raw hex sticky colour — only the named tokens are allowed', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [
        { type: 'sticky', id: 's1', x: 0, y: 0, w: 10, h: 10, text: 'x', color: '#ff0000' },
      ],
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(false);
  });

  it('rejects a sticker emoji outside the curated allowlist', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [{ type: 'sticker', id: 'k1', x: 0, y: 0, emoji: '🦄' }],
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(false);
  });

  it('rejects graph semantics smuggled onto a canvas connector (strict)', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [
        { type: 'connector', id: 'c1', from: 'a', to: 'b', relation: 'composition', order: 1 },
      ],
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(false);
  });

  it('rejects an unknown top-level canvas key and an unknown object key (strict)', () => {
    const extraBlockKey = { kind: 'canvas', id: 'board', objects: [], background: 'grid' };
    expect(canvasBlockSchema.safeParse(extraBlockKey).success).toBe(false);

    const extraObjectKey = {
      kind: 'canvas',
      id: 'board',
      objects: [{ type: 'sticker', id: 'k1', x: 0, y: 0, emoji: '👍', onClick: 'alert(1)' }],
    };
    expect(canvasBlockSchema.safeParse(extraObjectKey).success).toBe(false);
  });

  it('rejects a stroke object — freehand ink is not part of the canvas union', () => {
    const body = {
      kind: 'canvas',
      id: 'board',
      objects: [{ type: 'stroke', id: 'p1', points: [[0, 0]], color: 'ink', width: 2 }],
    };
    expect(canvasBlockSchema.safeParse(body).success).toBe(false);
  });

  it('rejects degenerate canvas geometry', () => {
    const nonFinite = {
      kind: 'canvas',
      id: 'board',
      objects: [{ type: 'sticker', id: 'k1', x: Number.POSITIVE_INFINITY, y: 0, emoji: '👍' }],
    };
    expect(canvasBlockSchema.safeParse(nonFinite).success).toBe(false);

    const zeroWidth = {
      kind: 'canvas',
      id: 'board',
      objects: [{ type: 'frame', id: 'f1', x: 0, y: 0, w: 0, h: 100, label: 'Empty column' }],
    };
    expect(canvasBlockSchema.safeParse(zeroWidth).success).toBe(false);
  });
});

describe('wiki publication wire contracts', () => {
  const request = {
    requestId: '0dcfa1d3-5d01-4cf6-b489-61e3cfa0b40d',
    expectedRevisionId: null,
    title: 'Status',
    markdown: '## Status\n\nReady.',
    yjsState: 'AQIDBA==',
  };

  it('accepts only the strict publish request and response shapes', () => {
    expect(wikiPublishRequestSchema.parse(request)).toEqual(request);
    expect(
      wikiPublishResponseSchema.parse({
        publicationId: '3a1e5e25-25d2-4f04-a3b6-1f7bb8b3359b',
        revision: 1,
        publishedAt: '2026-08-01T00:00:00.000Z',
      }),
    ).toMatchObject({ revision: 1 });
    expect(wikiPublishRequestSchema.safeParse({ ...request, ignored: true }).success).toBe(false);
    expect(wikiPublishRequestSchema.safeParse({ ...request, title: undefined }).success).toBe(
      false,
    );
  });

  it('rejects invalid publish identifiers, text bounds, and non-canonical base64', () => {
    expect(wikiPublishRequestSchema.safeParse({ ...request, requestId: 'request' }).success).toBe(
      false,
    );
    expect(
      wikiPublishRequestSchema.safeParse({ ...request, expectedRevisionId: 'head' }).success,
    ).toBe(false);
    expect(wikiPublishRequestSchema.safeParse({ ...request, title: '   ' }).success).toBe(false);
    expect(wikiPublishRequestSchema.safeParse({ ...request, title: 'x'.repeat(241) }).success).toBe(
      false,
    );
    expect(
      wikiPublishRequestSchema.safeParse({ ...request, markdown: 'x'.repeat(500_001) }).success,
    ).toBe(false);
    expect(wikiPublishRequestSchema.safeParse({ ...request, yjsState: 'YWJjZA' }).success).toBe(
      false,
    );
    expect(wikiPublishRequestSchema.safeParse({ ...request, yjsState: '****' }).success).toBe(
      false,
    );
  });

  it('enforces the decoded yjs state size limit at the exact boundary', () => {
    const atLimit = 'A'.repeat(2_000_000);
    const oneByteOverLimit = `${atLimit}AA==`;

    expect(wikiPublishRequestSchema.safeParse({ ...request, yjsState: atLimit }).success).toBe(
      true,
    );
    expect(
      wikiPublishRequestSchema.safeParse({ ...request, yjsState: oneByteOverLimit }).success,
    ).toBe(false);
  });

  it('requires the page publication and revision pair to move together', () => {
    const page = {
      themeId: 'theme-1',
      pageId: 'page-1',
      title: 'Status',
      blocks: [],
      meta: null,
    };
    expect(
      wikiPageResponseSchema.safeParse({ ...page, publicationId: null, revision: null }).success,
    ).toBe(true);
    expect(
      wikiPageResponseSchema.safeParse({
        ...page,
        publicationId: 'e21a5508-c6c0-4d8a-af28-9f8c807f3cb5',
        revision: 1,
      }).success,
    ).toBe(true);
    expect(
      wikiPageResponseSchema.safeParse({ ...page, publicationId: null, revision: 1 }).success,
    ).toBe(false);
    expect(
      wikiPageResponseSchema.safeParse({
        ...page,
        publicationId: 'e21a5508-c6c0-4d8a-af28-9f8c807f3cb5',
        revision: null,
      }).success,
    ).toBe(false);
  });
});

describe('wikiFeedResponseSchema', () => {
  const entry = {
    factId: '11111111-1111-4111-8111-111111111111',
    tag: 'decision',
    sourceKind: 'github',
    occurredAt: '2026-10-18T09:00:00.000Z',
    text: 'Ship the brake first',
  };
  const activity = { agent: 1, ci: 2, routine: 3, other: 4, windowHours: 24 };

  it('accepts a feed with entries and an activity line, and an empty feed with none', () => {
    expect(wikiFeedResponseSchema.safeParse({ entries: [entry], activity }).success).toBe(true);
    expect(wikiFeedResponseSchema.safeParse({ entries: [], activity: null }).success).toBe(true);
  });

  it('pins the line at 280 characters and the list at 20 entries', () => {
    expect(FEED_LINE_MAX_CHARS).toBe(280);
    expect(WIKI_FEED_MAX_ENTRIES).toBe(20);
    expect(
      wikiFeedResponseSchema.safeParse({
        entries: [{ ...entry, text: 'x'.repeat(FEED_LINE_MAX_CHARS) }],
        activity: null,
      }).success,
    ).toBe(true);
    expect(
      wikiFeedResponseSchema.safeParse({
        entries: [{ ...entry, text: 'x'.repeat(FEED_LINE_MAX_CHARS + 1) }],
        activity: null,
      }).success,
    ).toBe(false);
    expect(
      wikiFeedResponseSchema.safeParse({
        entries: Array.from({ length: WIKI_FEED_MAX_ENTRIES + 1 }, () => entry),
        activity: null,
      }).success,
    ).toBe(false);
  });

  it('refuses unknown keys at every level, so no field can smuggle content', () => {
    expect(
      wikiFeedResponseSchema.safeParse({ entries: [], activity: null, body: 'x' }).success,
    ).toBe(false);
    expect(
      wikiFeedResponseSchema.safeParse({ entries: [{ ...entry, body: 'x' }], activity: null })
        .success,
    ).toBe(false);
    expect(
      wikiFeedResponseSchema.safeParse({ entries: [], activity: { ...activity, who: 'x' } })
        .success,
    ).toBe(false);
  });

  it('requires the closed tag set, a uuid fact id, an ISO time and a 24 hour window', () => {
    for (const bad of [
      { ...entry, tag: 'deletion' },
      { ...entry, factId: 'not-a-uuid' },
      { ...entry, occurredAt: 'yesterday' },
    ]) {
      expect(wikiFeedResponseSchema.safeParse({ entries: [bad], activity: null }).success).toBe(
        false,
      );
    }
    expect(
      wikiFeedResponseSchema.safeParse({ entries: [], activity: { ...activity, windowHours: 12 } })
        .success,
    ).toBe(false);
    for (const tag of ['decision', 'incident', 'merged', 'closed', 'update']) {
      expect(
        wikiFeedResponseSchema.safeParse({ entries: [{ ...entry, tag }], activity: null }).success,
      ).toBe(true);
    }
  });

  it('refuses a negative or fractional count', () => {
    for (const agent of [-1, 1.5]) {
      expect(
        wikiFeedResponseSchema.safeParse({ entries: [], activity: { ...activity, agent } }).success,
      ).toBe(false);
    }
  });
});

describe('wikiPageStatusResponseSchema', () => {
  const status = { revision: null, version: 's:1', updatesQueued: true };

  it('accepts a null or positive revision', () => {
    expect(wikiPageStatusResponseSchema.safeParse(status).success).toBe(true);
    expect(wikiPageStatusResponseSchema.safeParse({ ...status, revision: 3 }).success).toBe(true);
  });

  it.each([0, -1, 1.5])('rejects revision %s', (revision) => {
    expect(wikiPageStatusResponseSchema.safeParse({ ...status, revision }).success).toBe(false);
  });

  it('rejects an unknown key, a long version and a missing flag', () => {
    expect(wikiPageStatusResponseSchema.safeParse({ ...status, title: 'x' }).success).toBe(false);
    expect(
      wikiPageStatusResponseSchema.safeParse({ ...status, version: 'v'.repeat(65) }).success,
    ).toBe(false);
    expect(
      wikiPageStatusResponseSchema.safeParse({ revision: null, version: 'none' }).success,
    ).toBe(false);
  });
});

describe('wikiPageResponseSchema renderedAt', () => {
  const page = {
    themeId: 't',
    pageId: 'p',
    publicationId: null,
    revision: null,
    title: 'T',
    blocks: [],
    meta: null,
  };

  it('is optional, nullable or a datetime', () => {
    expect(wikiPageResponseSchema.parse(page).renderedAt).toBeUndefined();
    expect(wikiPageResponseSchema.parse({ ...page, renderedAt: null }).renderedAt).toBeNull();
    const at = '2026-10-18T12:00:00.000Z';
    expect(wikiPageResponseSchema.parse({ ...page, renderedAt: at }).renderedAt).toBe(at);
    expect(wikiPageResponseSchema.safeParse({ ...page, renderedAt: 'yesterday' }).success).toBe(
      false,
    );
  });
});

describe('wikiStubResponseSchema', () => {
  const stub = {
    themeId: '11111111-1111-4111-8111-111111111111',
    title: 'Billing',
    state: 'building',
  };

  it.each(['page', 'building', 'deferred', 'unavailable'])('accepts state %s', (state) => {
    expect(wikiStubResponseSchema.safeParse({ ...stub, state }).success).toBe(true);
  });

  it('rejects an unknown state, an unknown key and a non-uuid theme', () => {
    expect(wikiStubResponseSchema.safeParse({ ...stub, state: 'ready' }).success).toBe(false);
    expect(wikiStubResponseSchema.safeParse({ ...stub, body: 'x' }).success).toBe(false);
    expect(wikiStubResponseSchema.safeParse({ ...stub, themeId: 'billing' }).success).toBe(false);
  });

  it('allows a title of exactly 300 characters and no more', () => {
    expect(wikiStubResponseSchema.safeParse({ ...stub, title: 'x'.repeat(300) }).success).toBe(
      true,
    );
    expect(wikiStubResponseSchema.safeParse({ ...stub, title: 'x'.repeat(301) }).success).toBe(
      false,
    );
  });
});

describe('wikiStubListEntrySchema', () => {
  const entry = { themeId: '11111111-1111-4111-8111-111111111111', title: 'Billing', kind: 'stub' };

  it('accepts only the stub kind and the three keys', () => {
    expect(wikiStubListEntrySchema.safeParse(entry).success).toBe(true);
    expect(wikiStubListEntrySchema.safeParse({ ...entry, kind: 'page' }).success).toBe(false);
    expect(wikiStubListEntrySchema.safeParse({ ...entry, state: 'building' }).success).toBe(false);
  });
});

describe('wiki list contracts', () => {
  const TEAM = '11111111-1111-4111-8111-111111111111';

  it('defaults the limit and rejects unknown, oversized or malformed query fields', () => {
    expect(wikiListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(wikiListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
    expect(wikiListQuerySchema.safeParse({ offset: '5' }).success).toBe(false);
    expect(wikiListQuerySchema.safeParse({ team: 'not-a-uuid' }).success).toBe(false);
    expect(wikiListQuerySchema.safeParse({ audience: 'x' }).success).toBe(false);
    expect(wikiListQuerySchema.safeParse({ docType: 'nonsense' }).success).toBe(false);
    expect(
      wikiListQuerySchema.parse({ q: '  auth ', team: TEAM, docType: 'runbook' }),
    ).toMatchObject({ q: 'auth', team: TEAM, docType: 'runbook' });
  });

  it('accepts a theme row and a team onboarding row and rejects extra fields', () => {
    const base = {
      id: 'p1',
      themeId: 't1',
      onboardingTeamId: null,
      title: 'Auth',
      docType: 'concept',
      audienceId: null,
      team: { id: TEAM, name: 'Platform' },
      owner: { userId: 'u1', name: 'Ada' },
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const onboarding = { ...base, kind: 'team_onboarding', themeId: null, onboardingTeamId: TEAM };
    const parsed = wikiListResponseSchema.parse({
      pages: [{ ...base, kind: 'theme' }, onboarding],
      limit: 50,
      nextCursor: null,
      truncated: false,
    });
    expect(parsed.pages).toHaveLength(2);
    expect(
      wikiListResponseSchema.safeParse({
        pages: [{ ...base, kind: 'theme', body: 'x' }],
        limit: 1,
        nextCursor: null,
        truncated: false,
      }).success,
    ).toBe(false);
  });
});

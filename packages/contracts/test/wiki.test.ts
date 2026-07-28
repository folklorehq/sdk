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
  richBlockBodySchema,
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

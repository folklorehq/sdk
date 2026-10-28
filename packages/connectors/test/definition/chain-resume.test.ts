// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import type { SpecStreamState } from '@folklore/contracts';
import type { PullOptions, PullResult } from '../../src/connector.js';
import { GENERIC_SHAPE_ADAPTERS } from '../../src/definition/generic-shapes.js';
import { SpecConnector } from '../../src/definition/SpecConnector.js';
import { FixtureTransport } from '../doubles/definition/FixtureTransport.js';
import { TwoStreamWorld } from '../doubles/definition/TwoStreamWorld.js';
import { twoStreamSpec } from './fixtures/two-stream-spec.js';
import { FIXTURE_MANIFEST } from './fixtures/streams.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const OLD_PROJECTS_C = '2026-08-02T00:00:00.000Z';
const OLD_TASKS_C = '2026-08-08T00:00:00.000Z';
const NEW_STAMP = '2026-09-01T00:00:00.000Z';

function standardWorld(): TwoStreamWorld {
  const world = new TwoStreamWorld();
  world.addProject({ id: 'p1', updatedAt: '2026-08-01T00:00:00.000Z' }, [
    { id: 't1a', updatedAt: '2026-08-03T00:00:00.000Z' },
    { id: 't1b', updatedAt: '2026-08-04T00:00:00.000Z' },
    { id: 't1c', updatedAt: '2026-08-05T00:00:00.000Z' },
  ]);
  world.addProject({ id: 'p2', updatedAt: OLD_PROJECTS_C }, [
    { id: 't2a', updatedAt: '2026-08-06T00:00:00.000Z' },
    { id: 't2b', updatedAt: '2026-08-07T00:00:00.000Z' },
    { id: 't2c', updatedAt: OLD_TASKS_C },
  ]);
  return world;
}

interface PullTrace {
  requests: string[];
  facts: string[];
  hasMore: boolean;
  cursor: Record<string, SpecStreamState> | string | null;
}

class Runner {
  cursor: string | null = null;
  readonly pulls: PullTrace[] = [];

  constructor(private readonly world: TwoStreamWorld) {}

  async pull(options: PullOptions = {}): Promise<PullResult> {
    const transport = new FixtureTransport(this.world.route);
    const connector = new SpecConnector(
      { logger: new PinoLogger({ level: 'silent' }) },
      {
        spec: twoStreamSpec,
        manifest: FIXTURE_MANIFEST,
        transport,
        shapes: GENERIC_SHAPE_ADAPTERS,
        now: () => NOW,
      },
    );
    const result = await connector.pull({ value: this.cursor }, options);
    this.cursor = result.cursor.value;
    this.pulls.push({
      requests: transport.requests.map((r) => `${r.url.pathname}${r.url.search}`),
      facts: result.facts.map((f) => f.sourceFactId),
      hasMore: result.hasMore,
      cursor: decode(result.cursor.value),
    });
    return result;
  }

  get last(): PullTrace {
    return this.pulls[this.pulls.length - 1]!;
  }

  serialize(): string {
    return `${JSON.stringify({ pulls: this.pulls }, null, 2)}\n`;
  }
}

function decode(value: string | null): PullTrace['cursor'] {
  if (value === null) return null;
  const parsed = JSON.parse(value) as { streams: Record<string, string> };
  return Object.fromEntries(
    Object.entries(parsed.streams).map(([name, json]) => [
      name,
      JSON.parse(json) as SpecStreamState,
    ]),
  );
}

function states(trace: PullTrace): Record<string, SpecStreamState> {
  return trace.cursor as Record<string, SpecStreamState>;
}

function expectGolden(name: string, serialized: string): void {
  const golden = readFileSync(new URL(`./__golden__/${name}.json`, import.meta.url), 'utf8');
  expect(serialized).toEqual(golden);
}

const sinceOf = (request: string) => new URL(`https://x.test${request}`).searchParams.get('since');

describe('parent and child chain resume', () => {
  it('T1 two-stream-full: one pull emits every task and commits both watermarks', async () => {
    const runner = new Runner(standardWorld());
    const result = await runner.pull();
    expect(result.hasMore).toBe(false);
    expect(result.facts).toHaveLength(8);
    const stored = states(runner.last);
    expect(stored['projects']).toMatchObject({
      c: OLD_PROJECTS_C,
      m: null,
      d: false,
      p: null,
      i: null,
      k: null,
      w: null,
    });
    expect(stored['tasks']).toMatchObject({
      c: OLD_TASKS_C,
      m: null,
      d: false,
      p: null,
      i: null,
      k: null,
      w: null,
    });
    expectGolden('two-stream-full', runner.serialize());
  });

  it('T2 two-stream-budget: stops inside and after the first project, resumes by key and commits at the end', async () => {
    const runner = new Runner(standardWorld());
    await runner.pull({ maxFacts: 2 });
    const first = states(runner.last);
    expect(runner.last.hasMore).toBe(true);
    expect(first['projects']).toMatchObject({ c: null, p: null, i: 0, d: false });
    expect(first['projects']?.m).toBe('2026-08-01T00:00:00.000Z');
    expect(first['tasks']).toMatchObject({ c: null, k: 'p1', p: 'page-2', i: null });
    expect(first['tasks']?.m).toBe('2026-08-03T00:00:00.000Z');

    await runner.pull({ maxFacts: 2 });
    expect(runner.last.hasMore).toBe(true);
    expect(states(runner.last)['projects']).toMatchObject({ c: null, p: null, i: 0 });
    expect(states(runner.last)['tasks']).toMatchObject({ c: null, k: 'p1', p: null });

    await runner.pull({ maxFacts: 2 });
    expect(runner.last.hasMore).toBe(true);
    expect(states(runner.last)['projects']).toMatchObject({ c: null, p: null, i: 1 });
    expect(states(runner.last)['tasks']).toMatchObject({ c: null, k: 'p2', p: 'page-2' });

    await runner.pull({ maxFacts: 2 });
    expect(runner.last.hasMore).toBe(false);
    expect(states(runner.last)['projects']).toMatchObject({ c: OLD_PROJECTS_C, m: null, i: null });
    expect(states(runner.last)['tasks']).toMatchObject({
      c: OLD_TASKS_C,
      m: null,
      p: null,
      k: null,
    });
    expectGolden('two-stream-budget', runner.serialize());
  });

  it('T3 two-stream-parent-inserted: finds the parent by key, sets d and keeps c', async () => {
    const world = standardWorld();
    const runner = new Runner(world);
    await runner.pull();
    world.touchEverything(NEW_STAMP);
    await runner.pull({ maxFacts: 2 });
    expect(states(runner.last)['projects']).toMatchObject({ p: null, i: 0, d: false });

    world.insertProjectFirst({ id: 'p0', updatedAt: NEW_STAMP }, [
      { id: 't0a', updatedAt: NEW_STAMP },
    ]);
    await runner.pull({ maxFacts: 3 });
    const shifted = runner.last;
    expect(shifted.requests[0]).toBe(`/v1/projects?since=${encodeURIComponent(OLD_PROJECTS_C)}`);
    expect(shifted.requests[1]).toMatch(/\/v1\/projects\/p1\/tasks\?.*pageToken=page-2/);
    expect(shifted.hasMore).toBe(true);
    expect(states(shifted)['projects']).toMatchObject({ d: true, i: 2 });
    expect(states(shifted)['tasks']).toMatchObject({ k: 'p2', p: 'page-2' });

    await runner.pull();
    const finished = runner.last;
    expect(finished.requests.some((r) => r.includes('/p0/'))).toBe(false);
    expect(finished.hasMore).toBe(false);
    const stored = states(finished);
    expect(stored['projects']).toMatchObject({ c: OLD_PROJECTS_C, m: null, d: false, i: null });
    expect(stored['tasks']).toMatchObject({ c: OLD_TASKS_C, m: null, k: null, p: null });

    await runner.pull();
    expect(runner.last.requests.some((r) => r.includes('/p0/tasks'))).toBe(true);
    expect(runner.last.facts).toContain('example:comment:t0a');
    expect(states(runner.last)['tasks']).toMatchObject({ c: NEW_STAMP, m: null });
    expectGolden('two-stream-parent-inserted', runner.serialize());
  });

  it('T4 two-stream-watermark: a partial run never sends a cursor beyond the committed one', async () => {
    const world = standardWorld();
    const runner = new Runner(world);
    await runner.pull();
    world.touchEverything(NEW_STAMP);
    await runner.pull({ maxFacts: 2 });
    expect(runner.last.hasMore).toBe(true);
    await runner.pull({ maxFacts: 2 });
    expect(runner.last.hasMore).toBe(true);
    expect(states(runner.last)['tasks']).toMatchObject({ c: OLD_TASKS_C });
    expect(states(runner.last)['tasks']?.m).toBe(NEW_STAMP);

    await runner.pull({ maxFacts: 2 });
    expect(runner.last.hasMore).toBe(true);
    await runner.pull({ maxFacts: 2 });
    expect(runner.last.hasMore).toBe(false);
    expect(states(runner.last)['tasks']).toMatchObject({ c: NEW_STAMP, m: null });
    expect(states(runner.last)['projects']).toMatchObject({ c: NEW_STAMP, m: null });
    for (const trace of runner.pulls.slice(1)) {
      for (const request of trace.requests) {
        const expected = request.startsWith('/v1/projects?') ? OLD_PROJECTS_C : OLD_TASKS_C;
        expect(sinceOf(request), request).toBe(expected);
      }
    }
    expectGolden('two-stream-watermark', runner.serialize());
  });

  it('T5 two-stream-parent-deleted: finds the shifted parent, sets d and re-walks from the old c', async () => {
    const world = standardWorld();
    const runner = new Runner(world);
    await runner.pull();
    world.touchEverything(NEW_STAMP);
    await runner.pull({ maxFacts: 5 });
    expect(states(runner.last)['projects']).toMatchObject({ p: null, i: 1 });
    expect(states(runner.last)['tasks']).toMatchObject({ k: 'p2', p: 'page-2' });

    world.deleteProject('p1');
    await runner.pull({ maxFacts: 1 });
    const shifted = runner.last;
    expect(shifted.requests[1]).toMatch(/\/v1\/projects\/p2\/tasks\?.*pageToken=page-2/);
    expect(shifted.hasMore).toBe(true);
    expect(states(shifted)['projects']).toMatchObject({ d: true, i: 0 });
    expect(states(shifted)['tasks']).toMatchObject({ k: 'p2', p: 'page-3' });

    await runner.pull();
    const finished = runner.last;
    expect(finished.hasMore).toBe(false);
    const stored = states(finished);
    expect(stored['projects']).toMatchObject({ c: OLD_PROJECTS_C, m: null });
    expect(stored['tasks']).toMatchObject({ c: OLD_TASKS_C, m: null });

    await runner.pull();
    const rewalk = runner.last;
    expect(rewalk.requests.filter((r) => r.includes('/p2/tasks'))).toHaveLength(3);
    expect(rewalk.requests.some((r) => r.includes('/p2/tasks?') && !r.includes('pageToken'))).toBe(
      true,
    );
    expect(rewalk.facts).toContain('example:comment:t2a');
    expect(states(rewalk)['tasks']).toMatchObject({ c: NEW_STAMP, m: null });
    expectGolden('two-stream-parent-deleted', runner.serialize());
  });
});

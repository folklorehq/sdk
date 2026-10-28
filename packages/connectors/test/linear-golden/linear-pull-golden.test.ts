// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import { LinearRateLimitedError } from '../../src/linear/client.js';
import { linearPullConnector } from '../../src/linear/linear-definition.js';
import type { LinearConnector } from '../../src/linear/LinearConnector.js';
import type { PullResult, SyncCursor } from '../../src/connector.js';
import type { FakeLinearApi } from '../doubles/linear/FakeLinearApi.js';
import { issuesWorld, overflowWorld } from '../doubles/linear/linear-golden-world.js';
import { NOW, daysAgo, projectNode } from '../fixtures/linear.js';
import { serializeLinearGolden } from './golden.js';

const MINUTE_MS = 60_000;
const SMALL_PAGE = 1;
const FACT_BUDGET = 2;
const STALE_AFTER = '2';
const COMPLEXITY_LEFT = 1;

function connectorFor(fake: FakeLinearApi): LinearConnector {
  const logger = new PinoLogger({ level: 'silent' });
  return linearPullConnector({ logger, token: 'test-token' }, fake, () => NOW);
}

function staleSliceCursor(): SyncCursor {
  const empty = { wm: null, emitAfter: null, slice: null };
  const slice = { untilMs: NOW.getTime() - 2 * MINUTE_MS, after: '1', lastId: null };
  return {
    value: JSON.stringify({
      v: 1,
      w: {
        projects: empty,
        cycles: empty,
        issues: { wm: null, emitAfter: null, slice },
        comments: empty,
      },
    }),
  };
}

async function expectGolden(name: string, pulls: readonly PullResult[]): Promise<void> {
  await expect(serializeLinearGolden(pulls)).toMatchFileSnapshot(`./__golden__/${name}.json`);
}

describe('linear pull golden capture', () => {
  it('L1 fresh pull of all four streams, with history overflow', async () => {
    const result = await connectorFor(overflowWorld()).pull({ value: null });
    await expectGolden('L1-fresh-overflow', [result]);
  });

  it('L2 a fact budget stops mid-page and the next pull resumes', async () => {
    const connector = connectorFor(overflowWorld());
    const first = await connector.pull({ value: null }, { maxFacts: FACT_BUDGET });
    const second = await connector.pull(first.cursor, { maxFacts: FACT_BUDGET });
    await expectGolden('L2-budget-resume', [first, second]);
  });

  it('L3 a stale cursor is retried once without re-emitting facts', async () => {
    const fake = issuesWorld(3, SMALL_PAGE);
    fake.staleCursorOnce = { stream: 'issues', after: STALE_AFTER };
    const result = await connectorFor(fake).pull(staleSliceCursor());
    await expectGolden('L3-stale-cursor', [result]);
  });

  it('L4 a failing comments stream is rolled back and the other streams are kept', async () => {
    const fake = overflowWorld();
    fake.failures.comments = new LinearRateLimitedError();
    const result = await connectorFor(fake).pull({ value: null });
    await expectGolden('L4-comments-failure', [result]);
  });

  it('L5 the complexity guard stops the pull after the first stream', async () => {
    const fake = overflowWorld();
    fake.projectNodes = [projectNode({ createdAt: daysAgo(2), updatedAt: daysAgo(2) })];
    fake.complexityAfterFirstRequest = COMPLEXITY_LEFT;
    const result = await connectorFor(fake).pull({ value: null });
    await expectGolden('L5-complexity-guard', [result]);
  });
});

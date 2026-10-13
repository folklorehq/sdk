// SPDX-License-Identifier: Apache-2.0
import { PinoLogger } from '@folklore/logger';
import { describe, expect, it } from 'vitest';
import type { PullResult } from '../src/connector.js';
import { GitHubConnector } from '../src/github/GitHubConnector.js';
import type { GitHubClient } from '../src/github/client.js';
import { OctokitGitHubClient } from '../src/github/OctokitGitHubClient.js';
import { readGitHubPullCursor } from '../src/github/pull-cursor.js';
import type { GitHubPullRequestWithDetail, GitHubRepo } from '../src/github/types.js';
import { FakeGitHubApi } from './doubles/github/FakeGitHubApi.js';
import { BACKFILL_SINCE, buildBackfillWorld } from './doubles/github/backfill-world.js';

const CHUNK_FACTS = 40;
const MAX_CHUNKS = 100;
const repo: GitHubRepo = { id: 42, full_name: 'acme/widget', private: true };

function silentContext() {
  return { logger: new PinoLogger({ level: 'silent' }) };
}

function octokitConnector(api: FakeGitHubApi): GitHubConnector {
  return new GitHubConnector(
    silentContext(),
    new OctokitGitHubClient('test-token', { transport: api.fetch }),
  );
}

function openPullRequest(id: number, updatedAt: string): GitHubPullRequestWithDetail {
  return {
    pullRequest: {
      id,
      number: id,
      title: `PR ${id}`,
      body: null,
      state: 'open',
      user: { id: 5, login: 'dev' },
      created_at: updatedAt,
      updated_at: updatedAt,
    },
    detail: { additions: 1, deletions: 1, changed_files: 1 },
  };
}

// Lists like the real client: newest first, keeping everything updated at or after `since`.
function listingClient(pullRequests: GitHubPullRequestWithDetail[]): GitHubClient {
  return {
    listRepositories: async () => [repo],
    listPullRequestsUpdatedSince: async (_repo, since) =>
      pullRequests
        .filter(({ pullRequest }) => since === undefined || pullRequest.updated_at >= since)
        .sort((a, b) => b.pullRequest.updated_at.localeCompare(a.pullRequest.updated_at)),
    listIssueCommentsUpdatedSince: async () => [],
    getPullRequestFiles: async () => [],
  };
}

function chained(value: string | null): unknown {
  const decoded = JSON.parse(value!) as { updatedAt: string; commentsSince: string | null };
  return { updatedAt: decoded.updatedAt, commentsSince: decoded.commentsSince };
}

async function drainChunks(connector: GitHubConnector, since: Date): Promise<PullResult[]> {
  const chunks: PullResult[] = [];
  let cursor: string | null = null;
  for (let attempt = 0; attempt < MAX_CHUNKS; attempt += 1) {
    const chunk = await connector.pull({ value: cursor }, { since, maxFacts: CHUNK_FACTS });
    chunks.push(chunk);
    if (!chunk.hasMore) return chunks;
    cursor = chunk.cursor.value;
  }
  throw new Error('chunked pull never finished');
}

describe('GitHubConnector.pull with a fact budget', () => {
  it('covers exactly the unbounded backfill across chunks, each resuming at its cursor', async () => {
    const since = new Date(BACKFILL_SINCE);
    const whole = await octokitConnector(new FakeGitHubApi(buildBackfillWorld())).pull(
      { value: null },
      { since },
    );

    const chunks = await drainChunks(
      octokitConnector(new FakeGitHubApi(buildBackfillWorld())),
      since,
    );

    const chunkedIds = new Set(chunks.flatMap((chunk) => chunk.facts.map((f) => f.sourceFactId)));
    expect(chunks.length).toBeGreaterThan(1);
    expect([...chunkedIds].sort()).toEqual(whole.facts.map((f) => f.sourceFactId).sort());
    expect(chunks.at(-1)?.cursor.value).toBe(whole.cursor.value);
    const cursors = chunks.map(
      (chunk) => readGitHubPullCursor(chunk.cursor.value, null).updatedAt!,
    );
    expect(cursors).toEqual([...cursors].sort());
    expect(new Set(cursors).size).toBe(cursors.length);
  });

  it('keeps every chunk near its budget instead of returning the whole window', async () => {
    const chunks = await drainChunks(
      octokitConnector(new FakeGitHubApi(buildBackfillWorld())),
      new Date(BACKFILL_SINCE),
    );

    const [first] = chunks;
    expect(first?.hasMore).toBe(true);
    expect(first?.facts.length).toBeGreaterThanOrEqual(CHUNK_FACTS);
    expect(first?.facts.length).toBeLessThan(CHUNK_FACTS * 2);
  });

  it('takes the oldest updates first and puts the cursor on the last one taken', async () => {
    const connector = new GitHubConnector(
      silentContext(),
      listingClient([
        openPullRequest(3, '2026-06-03T00:00:00Z'),
        openPullRequest(1, '2026-06-01T00:00:00Z'),
        openPullRequest(2, '2026-06-02T00:00:00Z'),
      ]),
    );

    const result = await connector.pull({ value: null }, { maxFacts: 2 });

    expect(result.facts.map((f) => f.sourceFactId)).toEqual([
      'github:pr_opened:1',
      'github:pr_opened:2',
    ]);
    expect(chained(result.cursor.value)).toEqual({
      updatedAt: '2026-06-02T00:00:00Z',
      commentsSince: null,
    });
    expect(result.hasMore).toBe(true);
  });

  it('never splits pull requests that share the boundary timestamp across chunks', async () => {
    const tied = '2026-06-01T00:00:00Z';
    const connector = new GitHubConnector(
      silentContext(),
      listingClient([
        openPullRequest(1, tied),
        openPullRequest(2, tied),
        openPullRequest(3, tied),
        openPullRequest(4, '2026-06-02T00:00:00Z'),
      ]),
    );

    const result = await connector.pull({ value: null }, { maxFacts: 1 });

    expect(result.facts.map((f) => f.sourceFactId).sort()).toEqual([
      'github:pr_opened:1',
      'github:pr_opened:2',
      'github:pr_opened:3',
    ]);
    expect(chained(result.cursor.value)).toEqual({ updatedAt: tied, commentsSince: null });
    expect(result.hasMore).toBe(true);
  });

  it('re-reads updates at the resume cursor without spending budget, so the cursor always advances', async () => {
    const resumeAt = '2026-06-01T00:00:00Z';
    const connector = new GitHubConnector(
      silentContext(),
      listingClient([
        openPullRequest(1, resumeAt),
        openPullRequest(2, resumeAt),
        openPullRequest(3, '2026-06-02T00:00:00Z'),
        openPullRequest(4, '2026-06-03T00:00:00Z'),
      ]),
    );

    const result = await connector.pull({ value: resumeAt }, { maxFacts: 1 });

    expect(result.facts.map((f) => f.sourceFactId)).toEqual([
      'github:pr_opened:1',
      'github:pr_opened:2',
      'github:pr_opened:3',
    ]);
    expect(chained(result.cursor.value)).toEqual({
      updatedAt: '2026-06-02T00:00:00Z',
      commentsSince: resumeAt,
    });
    expect(result.hasMore).toBe(true);
  });

  it('reports no more once the last update is taken, keeping an empty window at its cursor', async () => {
    const connector = new GitHubConnector(
      silentContext(),
      listingClient([openPullRequest(1, '2026-06-01T00:00:00Z')]),
    );

    const last = await connector.pull({ value: null }, { maxFacts: 5 });
    const empty = await connector.pull({ value: '2026-06-09T00:00:00Z' }, { maxFacts: 5 });

    expect(last.hasMore).toBe(false);
    expect(last.cursor.value).toBe('2026-06-01T00:00:00Z');
    expect(empty).toMatchObject({
      facts: [],
      hasMore: false,
      cursor: { value: '2026-06-09T00:00:00Z' },
    });
  });

  it('keeps the comment floor the chain started from, so a newer PR still brings its older comments', async () => {
    const floor = '2026-06-01T00:00:00Z';
    const commentsSince: Array<string | undefined> = [];
    const client: GitHubClient = {
      ...listingClient([openPullRequest(1, '2026-06-05T00:00:00Z')]),
      listIssueCommentsUpdatedSince: async (_repo, since) => {
        commentsSince.push(since);
        return [];
      },
    };
    const connector = new GitHubConnector(silentContext(), client);
    const midChain = JSON.stringify({
      v: 1,
      updatedAt: '2026-06-04T00:00:00Z',
      commentsSince: floor,
    });

    const result = await connector.pull({ value: midChain }, { maxFacts: 5 });

    expect(commentsSince).toEqual([floor]);
    expect(result).toMatchObject({ hasMore: false, cursor: { value: '2026-06-05T00:00:00Z' } });
  });

  it.each(['{not json', '{"v":2,"updatedAt":null,"commentsSince":null}', '{"v":1}'])(
    'refuses an unreadable chained cursor %s',
    async (value) => {
      const connector = new GitHubConnector(silentContext(), listingClient([]));

      await expect(connector.pull({ value }, { maxFacts: 5 })).rejects.toThrow(
        'github_cursor_invalid',
      );
    },
  );

  it.each([0, -1, 1.5, Number.NaN])('refuses a fact budget of %s', async (maxFacts) => {
    const connector = new GitHubConnector(silentContext(), listingClient([]));

    await expect(connector.pull({ value: null }, { maxFacts })).rejects.toThrow(
      'pull_fact_budget_invalid',
    );
  });
});

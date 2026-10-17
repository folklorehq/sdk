// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import type { Logger } from '@folklore/core';
import { PinoLogger } from '@folklore/logger';
import { describe, expect, it, vi } from 'vitest';
import { GitHubConnector } from '../src/github/GitHubConnector.js';
import { OctokitGitHubClient } from '../src/github/OctokitGitHubClient.js';
import { FakeGitHubApi } from './doubles/github/FakeGitHubApi.js';
import { BACKFILL_SINCE, buildBackfillWorld } from './doubles/github/backfill-world.js';

// Captured from the per-PR REST path (pulls.list + pulls.get + issues.listComments) over the same world.
const PER_PR_REST_OUTPUT = new URL(
  './fixtures/github/backfill-normalized.golden.json',
  import.meta.url,
);

async function backfill(api: FakeGitHubApi, transport: typeof fetch = api.fetch, logger?: Logger) {
  const connector = new GitHubConnector(
    { logger: new PinoLogger({ level: 'silent' }) },
    new OctokitGitHubClient('test-token', { transport, ...(logger ? { logger } : {}) }),
  );
  return connector.pull({ value: null }, { since: new Date(BACKFILL_SINCE) });
}

// Rewrites the first GraphQL page, leaving every REST response untouched.
function rewritingFirstGraphqlPage(
  api: FakeGitHubApi,
  rewrite: (body: {
    data: { repository: { pullRequests: { nodes: Record<string, unknown>[] } } };
  }) => unknown,
): typeof fetch {
  let rewritten = false;
  return async (input, init) => {
    const response = await api.fetch(input, init);
    if (init?.method !== 'POST' || rewritten) return response;
    rewritten = true;
    return new Response(JSON.stringify(rewrite(await response.json())), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
    });
  };
}

function silentLogger(): Logger {
  return {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

describe('GitHub backfill over the real Octokit transport', () => {
  it('normalizes to the same facts, containers and cursor the per-PR REST path produced', async () => {
    const result = await backfill(new FakeGitHubApi(buildBackfillWorld()));
    // Re-serializing the parsed fixture keeps its key order, so this compares bytes, not just shape.
    const expected = JSON.stringify(JSON.parse(readFileSync(PER_PR_REST_OUTPUT, 'utf8')));

    expect(JSON.stringify(result)).toBe(expected);
  });

  it('spends one GraphQL page per 25 PRs and one REST page per 100 comments, stopping at since', async () => {
    const api = new FakeGitHubApi(buildBackfillWorld());

    await backfill(api);

    expect({
      repositories: api.count('installation-repositories'),
      graphql: api.count('graphql'),
      repoComments: api.count('repo-comments'),
      pullsList: api.count('pulls-list'),
      pullsGet: api.count('pulls-get'),
      issueComments: api.count('issue-comments'),
    }).toEqual({
      repositories: 1,
      graphql: 11,
      repoComments: 3,
      pullsList: 0,
      pullsGet: 0,
      issueComments: 0,
    });
  });

  it('skips a PR GraphQL returns without an id and logs only how many, keeping the rest of the repo', async () => {
    const api = new FakeGitHubApi(buildBackfillWorld());
    const logger = silentLogger();
    const transport = rewritingFirstGraphqlPage(api, (body) => {
      body.data.repository.pullRequests.nodes[0]!['fullDatabaseId'] = null;
      return body;
    });

    const result = await backfill(api, transport, logger);

    expect(result.containers).toHaveLength(229);
    expect(result.facts.some((f) => f.sourceFactId === 'github:pr_opened:2400000340')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('github_pull_requests_without_id_skipped', {
      count: 1,
    });
  });

  it('maps an Organization author to its database id', async () => {
    const api = new FakeGitHubApi(buildBackfillWorld());
    const transport = rewritingFirstGraphqlPage(api, (body) => {
      body.data.repository.pullRequests.nodes[0]!['author'] = {
        __typename: 'Organization',
        login: 'acme',
        databaseId: 77,
      };
      return body;
    });

    const result = await backfill(api, transport);

    const opened = result.facts.find((f) => f.sourceFactId === 'github:pr_opened:2400000340');
    expect(opened?.authors[0]).toMatchObject({ sourceUserId: '77', displayName: 'acme' });
  });

  it('maps a GraphQL RATE_LIMITED response (HTTP 200, no status) to a rate-limit error', async () => {
    const api = new FakeGitHubApi(buildBackfillWorld());
    const transport = rewritingFirstGraphqlPage(api, () => ({
      data: null,
      errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }],
    }));

    await expect(backfill(api, transport)).rejects.toMatchObject({
      code: 'rate_limit',
      component: 'github',
    });
  });
});

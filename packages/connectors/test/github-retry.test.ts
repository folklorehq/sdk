// SPDX-License-Identifier: Apache-2.0
import { PinoLogger } from '@folklore/logger';
import { describe, expect, it } from 'vitest';
import { GitHubConnector } from '../src/github/GitHubConnector.js';
import { OctokitGitHubClient } from '../src/github/OctokitGitHubClient.js';
import { FakeGitHubApi } from './doubles/github/FakeGitHubApi.js';
import { BACKFILL_SINCE, buildBackfillWorld } from './doubles/github/backfill-world.js';

const ATTEMPTS_WITH_THREE_RETRIES = 4;
const FAST_RETRY_BASE_MS = 1;

interface Failure {
  route: 'repositories' | 'graphql';
  status: number;
  times: number;
}

// Answers the first `times` matching requests with `status`, then defers to the fake API.
class FailingTransport {
  attempts = 0;

  constructor(
    private readonly api: FakeGitHubApi,
    private readonly failure: Failure,
  ) {}

  readonly fetch: typeof fetch = async (input, init) => {
    if (this.matches(input, init)) {
      this.attempts += 1;
      if (this.attempts <= this.failure.times) {
        return new Response(JSON.stringify({ message: 'upstream detail' }), {
          status: this.failure.status,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
    }
    return this.api.fetch(input, init);
  };

  private matches(input: Parameters<typeof fetch>[0], init: Parameters<typeof fetch>[1]): boolean {
    const url = String(input instanceof Request ? input.url : input);
    if (this.failure.route === 'graphql') return init?.method === 'POST';
    return url.includes('/installation/repositories');
  }
}

function pull(transport: FailingTransport) {
  const connector = new GitHubConnector(
    { logger: new PinoLogger({ level: 'silent' }) },
    new OctokitGitHubClient('test-token', {
      transport: transport.fetch,
      retryBaseMs: FAST_RETRY_BASE_MS,
    }),
  );
  return connector.pull({ value: null }, { since: new Date(BACKFILL_SINCE) });
}

function transport(failure: Failure): { api: FakeGitHubApi; failing: FailingTransport } {
  const api = new FakeGitHubApi(buildBackfillWorld());
  return { api, failing: new FailingTransport(api, failure) };
}

describe('GitHub client transient-failure retry', () => {
  it('retries a REST 500 and completes the pull', async () => {
    const { failing } = transport({ route: 'repositories', status: 500, times: 1 });

    const result = await pull(failing);

    expect(failing.attempts).toBe(2);
    expect(result.containers).toHaveLength(230);
  });

  it('retries a GraphQL 502 and completes the pull', async () => {
    const { api, failing } = transport({ route: 'graphql', status: 502, times: 2 });

    const result = await pull(failing);

    expect(result.containers).toHaveLength(230);
    expect(api.count('graphql')).toBe(11);
  });

  it('gives up after three retries and surfaces the usual external-service error', async () => {
    const { failing } = transport({ route: 'repositories', status: 500, times: 99 });

    await expect(pull(failing)).rejects.toMatchObject({
      code: 'external_service_error',
      component: 'github',
      context: { operation: 'listRepositories' },
    });
    expect(failing.attempts).toBe(ATTEMPTS_WITH_THREE_RETRIES);
  });

  it.each([401, 404])('never retries a %i', async (status) => {
    const { failing } = transport({ route: 'repositories', status, times: 99 });

    await expect(pull(failing)).rejects.toBeDefined();
    expect(failing.attempts).toBe(1);
  });
});

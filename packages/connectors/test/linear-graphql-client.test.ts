// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { LinearRateLimitedError, LinearRequestError } from '../src/linear/client.js';
import { LinearGraphqlClient, type LinearRawTransport } from '../src/linear/LinearGraphqlClient.js';
import {
  LINEAR_COMMENTS_QUERY,
  LINEAR_ISSUE_HISTORY_QUERY,
  LINEAR_ISSUES_QUERY,
} from '../src/linear/queries.js';

const EMPTY_PAGE = { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } };
const WINDOW = { gtMs: Date.UTC(2026, 0, 1), lteMs: Date.UTC(2026, 0, 2) };
const SENTINEL = 'secret-sentinel query text';

function transportReturning(
  data: unknown,
  headers: Record<string, string> = {},
): { transport: LinearRawTransport; rawRequest: ReturnType<typeof vi.fn> } {
  const rawRequest = vi.fn(async () => ({ data, headers: new Headers(headers), status: 200 }));
  return { transport: { rawRequest } as unknown as LinearRawTransport, rawRequest };
}

function transportThrowing(error: unknown): LinearRawTransport {
  return { rawRequest: vi.fn(async () => Promise.reject(error)) } as unknown as LinearRawTransport;
}

async function caught(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

describe('LinearGraphqlClient requests', () => {
  it('sends the issues document with ISO window bounds and the page cursor', async () => {
    const { transport, rawRequest } = transportReturning({ issues: EMPTY_PAGE });

    await new LinearGraphqlClient(transport).issues(WINDOW, 'cursor-1');

    expect(rawRequest).toHaveBeenCalledWith(LINEAR_ISSUES_QUERY, {
      gt: '2026-01-01T00:00:00.000Z',
      lte: '2026-01-02T00:00:00.000Z',
      after: 'cursor-1',
    });
  });

  it('sends the comments document and unwraps the connection', async () => {
    const { transport, rawRequest } = transportReturning({ comments: EMPTY_PAGE });

    const page = await new LinearGraphqlClient(transport).comments(WINDOW, null);

    expect(page).toEqual(EMPTY_PAGE);
    expect(rawRequest.mock.calls[0]?.[0]).toBe(LINEAR_COMMENTS_QUERY);
  });

  it('sends the history document by issue id and unwraps the nested connection', async () => {
    const { transport, rawRequest } = transportReturning({ issue: { history: EMPTY_PAGE } });

    const page = await new LinearGraphqlClient(transport).issueHistory('issue-1', 'h-cursor');

    expect(page).toEqual(EMPTY_PAGE);
    expect(rawRequest).toHaveBeenCalledWith(LINEAR_ISSUE_HISTORY_QUERY, {
      id: 'issue-1',
      after: 'h-cursor',
    });
  });

  it('fails with a fixed code when the connection is missing from the response', async () => {
    const { transport } = transportReturning({});

    const error = await caught(new LinearGraphqlClient(transport).projects(WINDOW, null));

    expect(error).toBeInstanceOf(LinearRequestError);
    expect((error as LinearRequestError).code).toBe('linear_graphql_error');
  });
});

describe('LinearGraphqlClient rate state', () => {
  it('starts with no headers seen and no requests made', () => {
    const { transport } = transportReturning({});

    expect(new LinearGraphqlClient(transport).rateState()).toEqual({
      requestsMade: 0,
      complexityRemaining: null,
      requestsRemaining: null,
    });
  });

  it('records the rate headers and counts each call', async () => {
    const { transport } = transportReturning(
      { issues: EMPTY_PAGE },
      {
        'x-ratelimit-requests-remaining': '4990',
        'x-ratelimit-complexity-remaining': '1990000',
      },
    );
    const client = new LinearGraphqlClient(transport);

    await client.issues(WINDOW, null);
    await client.issues(WINDOW, null);

    expect(client.rateState()).toEqual({
      requestsMade: 2,
      complexityRemaining: 1_990_000,
      requestsRemaining: 4990,
    });
  });

  it('reads a missing header as null', async () => {
    const { transport } = transportReturning({ issues: EMPTY_PAGE });
    const client = new LinearGraphqlClient(transport);

    await client.issues(WINDOW, null);

    expect(client.rateState().complexityRemaining).toBeNull();
    expect(client.rateState().requestsRemaining).toBeNull();
  });

  it('reads the rate headers off a failed response', async () => {
    const client = new LinearGraphqlClient(
      transportThrowing({
        raw: {
          response: {
            status: 400,
            errors: [{ extensions: { code: 'RATELIMITED' } }],
            headers: new Headers({ 'x-ratelimit-requests-remaining': '0' }),
          },
        },
      }),
    );

    await caught(client.issues(WINDOW, null));

    expect(client.rateState().requestsRemaining).toBe(0);
  });
});

describe('LinearGraphqlClient error classification', () => {
  const rateLimited = {
    message: SENTINEL,
    raw: { response: { errors: [{ extensions: { code: 'RATELIMITED' } }], status: 400 } },
  };
  const unauthorized = { message: SENTINEL, raw: { response: { status: 401 } } };
  const other = new Error(SENTINEL, { cause: { response: SENTINEL } });

  it('maps a RATELIMITED extension code to a rate-limit error', async () => {
    const error = await caught(
      new LinearGraphqlClient(transportThrowing(rateLimited)).issues(WINDOW, null),
    );
    expect(error).toBeInstanceOf(LinearRateLimitedError);
  });

  it('maps a Ratelimited error type and a 429 status to a rate-limit error', async () => {
    for (const thrown of [
      { type: 'Ratelimited', message: SENTINEL },
      { message: SENTINEL, raw: { response: { status: 429 } } },
    ]) {
      const error = await caught(
        new LinearGraphqlClient(transportThrowing(thrown)).issues(WINDOW, null),
      );
      expect(error).toBeInstanceOf(LinearRateLimitedError);
    }
  });

  it('maps a 401 and an authentication error code to an unauthorized error', async () => {
    for (const thrown of [
      unauthorized,
      {
        message: SENTINEL,
        raw: {
          response: { status: 400, errors: [{ extensions: { code: 'AUTHENTICATION_ERROR' } }] },
        },
      },
    ]) {
      const error = await caught(
        new LinearGraphqlClient(transportThrowing(thrown)).issues(WINDOW, null),
      );
      expect(error).toBeInstanceOf(LinearRequestError);
      expect((error as LinearRequestError).code).toBe('linear_unauthorized');
      expect((error as LinearRequestError).status).toBe(401);
    }
  });

  it('maps an INVALID_INPUT extension code to a cursor-invalid error', async () => {
    const error = await caught(
      new LinearGraphqlClient(
        transportThrowing({
          message: SENTINEL,
          raw: { response: { status: 400, errors: [{ extensions: { code: 'INVALID_INPUT' } }] } },
        }),
      ).issues(WINDOW, 'old-cursor'),
    );

    expect(error).toBeInstanceOf(LinearRequestError);
    expect((error as LinearRequestError).code).toBe('linear_cursor_invalid');
    expect((error as Error).message).not.toContain(SENTINEL);
  });

  it('maps anything else to a generic graphql error without a status', async () => {
    const error = await caught(
      new LinearGraphqlClient(transportThrowing(other)).issues(WINDOW, null),
    );

    expect(error).toBeInstanceOf(LinearRequestError);
    expect((error as LinearRequestError).code).toBe('linear_graphql_error');
    expect((error as LinearRequestError).status).toBeUndefined();
  });

  it.each([
    ['rate limited', rateLimited],
    ['unauthorized', unauthorized],
    ['other', other],
  ])('keeps nothing of the provider error on the %s error', async (_name, thrown) => {
    const error = await caught(
      new LinearGraphqlClient(transportThrowing(thrown)).issues(WINDOW, null),
    );

    expect('cause' in error).toBe(false);
    expect('raw' in error).toBe(false);
    expect('response' in error).toBe(false);
    for (const key of Object.keys(error)) expect(['code', 'status']).toContain(key);
    expect(String(error)).not.toContain('secret-sentinel');
    expect(JSON.stringify(error)).not.toContain('secret-sentinel');
  });
});

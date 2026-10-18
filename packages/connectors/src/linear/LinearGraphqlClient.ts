// SPDX-License-Identifier: Apache-2.0
import type { LinearGraphQLClient } from '@linear/sdk';
import {
  LINEAR_RATE_LIMITED_STATUS,
  LINEAR_UNAUTHORIZED_STATUS,
  LinearRateLimitedError,
  LinearRequestError,
  type LinearApiClient,
  type LinearRateState,
  type LinearWindow,
} from './client.js';
import {
  LINEAR_COMMENTS_QUERY,
  LINEAR_CYCLES_QUERY,
  LINEAR_ISSUE_HISTORY_QUERY,
  LINEAR_ISSUES_QUERY,
  LINEAR_PROJECTS_QUERY,
} from './queries.js';
import type {
  LinearCommentNode,
  LinearCycleNode,
  LinearHistoryNode,
  LinearIssueNode,
  LinearPage,
  LinearProjectNode,
} from './types.js';

export type LinearRawTransport = Pick<LinearGraphQLClient, 'rawRequest'>;

const REQUESTS_REMAINING_HEADER = 'x-ratelimit-requests-remaining';
const COMPLEXITY_REMAINING_HEADER = 'x-ratelimit-complexity-remaining';
const RATE_LIMITED_EXTENSION_CODE = 'RATELIMITED';
const RATE_LIMITED_ERROR_TYPE = 'Ratelimited';
const AUTHENTICATION_EXTENSION_CODE = 'AUTHENTICATION_ERROR';
const INVALID_INPUT_EXTENSION_CODE = 'INVALID_INPUT';

interface LinearResponseData {
  readonly issues?: LinearPage<LinearIssueNode>;
  readonly comments?: LinearPage<LinearCommentNode>;
  readonly projects?: LinearPage<LinearProjectNode>;
  readonly cycles?: LinearPage<LinearCycleNode>;
  readonly issue?: { readonly history?: LinearPage<LinearHistoryNode> } | null;
}

interface LinearResponseShape {
  readonly status: number | null;
  readonly errorCodes: readonly string[];
  readonly headers: unknown;
}

type LinearVariables = Record<string, unknown>;

export class LinearGraphqlClient implements LinearApiClient {
  private requestsMade = 0;
  private complexityRemaining: number | null = null;
  private requestsRemaining: number | null = null;

  constructor(private readonly transport: LinearRawTransport) {}

  issues(window: LinearWindow, after: string | null): Promise<LinearPage<LinearIssueNode>> {
    return this.page(LINEAR_ISSUES_QUERY, this.windowVariables(window, after), (d) => d.issues);
  }

  issueHistory(issueId: string, after: string | null): Promise<LinearPage<LinearHistoryNode>> {
    return this.page(LINEAR_ISSUE_HISTORY_QUERY, { id: issueId, after }, (d) => d.issue?.history);
  }

  comments(window: LinearWindow, after: string | null): Promise<LinearPage<LinearCommentNode>> {
    return this.page(LINEAR_COMMENTS_QUERY, this.windowVariables(window, after), (d) => d.comments);
  }

  projects(window: LinearWindow, after: string | null): Promise<LinearPage<LinearProjectNode>> {
    return this.page(LINEAR_PROJECTS_QUERY, this.windowVariables(window, after), (d) => d.projects);
  }

  cycles(window: LinearWindow, after: string | null): Promise<LinearPage<LinearCycleNode>> {
    return this.page(LINEAR_CYCLES_QUERY, this.windowVariables(window, after), (d) => d.cycles);
  }

  rateState(): LinearRateState {
    return {
      requestsMade: this.requestsMade,
      complexityRemaining: this.complexityRemaining,
      requestsRemaining: this.requestsRemaining,
    };
  }

  private windowVariables(window: LinearWindow, after: string | null): LinearVariables {
    return {
      gt: new Date(window.gtMs).toISOString(),
      lte: new Date(window.lteMs).toISOString(),
      after,
    };
  }

  private async page<T>(
    query: string,
    variables: LinearVariables,
    pick: (data: LinearResponseData) => LinearPage<T> | undefined,
  ): Promise<LinearPage<T>> {
    const data = await this.send(query, variables);
    const page = data === undefined ? undefined : pick(data);
    if (page === undefined) throw new LinearRequestError('linear_graphql_error');
    return page;
  }

  private async send(
    query: string,
    variables: LinearVariables,
  ): Promise<LinearResponseData | undefined> {
    this.requestsMade += 1;
    try {
      const response = await this.transport.rawRequest<LinearResponseData, LinearVariables>(
        query,
        variables,
      );
      this.recordRate(response.headers);
      return response.data;
    } catch (failure) {
      throw this.classify(failure);
    }
  }

  // The provider error is read for its status and codes, then dropped: it can carry the query and variables.
  private classify(failure: unknown): LinearRateLimitedError | LinearRequestError {
    const shape = this.responseShape(failure);
    this.recordRate(shape.headers);
    const isRateLimited =
      shape.errorCodes.includes(RATE_LIMITED_EXTENSION_CODE) ||
      (failure as { type?: unknown } | null)?.type === RATE_LIMITED_ERROR_TYPE ||
      shape.status === LINEAR_RATE_LIMITED_STATUS;
    if (isRateLimited) return new LinearRateLimitedError();
    const isUnauthorized =
      shape.status === LINEAR_UNAUTHORIZED_STATUS ||
      shape.errorCodes.includes(AUTHENTICATION_EXTENSION_CODE);
    if (isUnauthorized)
      return new LinearRequestError('linear_unauthorized', LINEAR_UNAUTHORIZED_STATUS);
    if (shape.errorCodes.includes(INVALID_INPUT_EXTENSION_CODE)) {
      return new LinearRequestError('linear_cursor_invalid');
    }
    return new LinearRequestError('linear_graphql_error');
  }

  private responseShape(failure: unknown): LinearResponseShape {
    const response = (
      failure as {
        raw?: { response?: { status?: unknown; errors?: unknown; headers?: unknown } };
      } | null
    )?.raw?.response;
    const errors = Array.isArray(response?.errors) ? (response.errors as unknown[]) : [];
    const errorCodes = errors
      .map((error) => (error as { extensions?: { code?: unknown } } | null)?.extensions?.code)
      .filter((code): code is string => typeof code === 'string');
    const status = typeof response?.status === 'number' ? response.status : null;
    return { status, errorCodes, headers: response?.headers };
  }

  private recordRate(headers: unknown): void {
    const requests = this.readIntegerHeader(headers, REQUESTS_REMAINING_HEADER);
    const complexity = this.readIntegerHeader(headers, COMPLEXITY_REMAINING_HEADER);
    if (requests !== null) this.requestsRemaining = requests;
    if (complexity !== null) this.complexityRemaining = complexity;
  }

  private readIntegerHeader(headers: unknown, name: string): number | null {
    const getter = (headers as { get?: unknown } | null | undefined)?.get;
    if (typeof getter !== 'function') return null;
    const raw: unknown = getter.call(headers, name);
    if (typeof raw !== 'string') return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  }
}

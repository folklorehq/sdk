// SPDX-License-Identifier: Apache-2.0
import type {
  LinearCommentNode,
  LinearCycleNode,
  LinearHistoryNode,
  LinearIssueNode,
  LinearPage,
  LinearProjectNode,
} from './types.js';

export interface LinearWindow {
  readonly gtMs: number;
  readonly lteMs: number;
}

export interface LinearRateState {
  readonly requestsMade: number;
  readonly complexityRemaining: number | null;
  readonly requestsRemaining: number | null;
}

export interface LinearApiClient {
  issues(window: LinearWindow, after: string | null): Promise<LinearPage<LinearIssueNode>>;
  issueHistory(issueId: string, after: string | null): Promise<LinearPage<LinearHistoryNode>>;
  comments(window: LinearWindow, after: string | null): Promise<LinearPage<LinearCommentNode>>;
  projects(window: LinearWindow, after: string | null): Promise<LinearPage<LinearProjectNode>>;
  cycles(window: LinearWindow, after: string | null): Promise<LinearPage<LinearCycleNode>>;
  rateState(): LinearRateState;
}

export const LINEAR_RATE_LIMITED_STATUS = 429;
export const LINEAR_UNAUTHORIZED_STATUS = 401;

/** Carries a fixed code only: nothing from the provider response is copied onto it. */
export class LinearRateLimitedError extends Error {
  readonly status = LINEAR_RATE_LIMITED_STATUS;

  constructor() {
    super('linear_rate_limited');
  }
}

export type LinearRequestErrorCode =
  | 'linear_unauthorized'
  | 'linear_graphql_error'
  | 'linear_cursor_invalid';

export class LinearRequestError extends Error {
  constructor(
    readonly code: LinearRequestErrorCode,
    readonly status?: typeof LINEAR_UNAUTHORIZED_STATUS,
  ) {
    super(code);
  }
}

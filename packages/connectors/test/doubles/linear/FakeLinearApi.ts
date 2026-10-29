// SPDX-License-Identifier: Apache-2.0
import {
  LinearRequestError,
  type LinearApiClient,
  type LinearRateState,
  type LinearWindow,
} from '../../../src/linear/client.js';
import type {
  LinearCommentNode,
  LinearCycleNode,
  LinearHistoryNode,
  LinearIssueNode,
  LinearPage,
  LinearProjectNode,
  LinearTeamNode,
} from '../../../src/linear/types.js';

export type FakeLinearStream = 'issues' | 'comments' | 'projects' | 'cycles';

const HISTORY_PAGE_SIZE = 2;

export class FakeLinearApi implements LinearApiClient {
  issueNodes: LinearIssueNode[] = [];
  commentNodes: LinearCommentNode[] = [];
  projectNodes: LinearProjectNode[] = [];
  cycleNodes: LinearCycleNode[] = [];
  teamNodes: LinearTeamNode[] = [];
  teamsFailure: Error | null = null;
  readonly historyOverflow = new Map<string, LinearHistoryNode[]>();
  readonly failures: Partial<Record<FakeLinearStream, Error>> = {};
  readonly windows: Array<{ stream: FakeLinearStream; window: LinearWindow }> = [];
  staleCursorOnce: { stream: FakeLinearStream; after: string } | null = null;
  failureAtCursor: { stream: FakeLinearStream; after: string; error: Error } | null = null;
  issueHistoryCalls = 0;
  historyFailure: Error | null = null;
  complexityAfterFirstRequest: number | null = null;
  private requests = 0;

  constructor(private readonly pageSize = 25) {}

  async issues(window: LinearWindow, after: string | null): Promise<LinearPage<LinearIssueNode>> {
    return this.read('issues', this.issueNodes, window, after);
  }

  async comments(
    window: LinearWindow,
    after: string | null,
  ): Promise<LinearPage<LinearCommentNode>> {
    return this.read('comments', this.commentNodes, window, after);
  }

  async projects(
    window: LinearWindow,
    after: string | null,
  ): Promise<LinearPage<LinearProjectNode>> {
    return this.read('projects', this.projectNodes, window, after);
  }

  async cycles(window: LinearWindow, after: string | null): Promise<LinearPage<LinearCycleNode>> {
    return this.read('cycles', this.cycleNodes, window, after);
  }

  async teams(after: string | null): Promise<LinearPage<LinearTeamNode>> {
    this.requests += 1;
    if (this.teamsFailure) throw this.teamsFailure;
    const start = after === null ? 0 : Number(after);
    const end = Math.min(start + this.pageSize, this.teamNodes.length);
    return {
      nodes: this.teamNodes.slice(start, end),
      pageInfo: { hasNextPage: end < this.teamNodes.length, endCursor: String(end) },
    };
  }

  async issueHistory(
    issueId: string,
    after: string | null,
  ): Promise<LinearPage<LinearHistoryNode>> {
    this.requests += 1;
    this.issueHistoryCalls += 1;
    if (this.historyFailure) throw this.historyFailure;
    const all = this.historyOverflow.get(issueId) ?? [];
    const start = after === null ? 0 : Number(after);
    const end = Math.min(start + HISTORY_PAGE_SIZE, all.length);
    return {
      nodes: all.slice(start, end),
      pageInfo: { hasNextPage: end < all.length, endCursor: String(end) },
    };
  }

  rateState(): LinearRateState {
    return {
      requestsMade: this.requests,
      complexityRemaining: this.requests > 0 ? this.complexityAfterFirstRequest : null,
      requestsRemaining: null,
    };
  }

  private read<T extends { readonly updatedAt: string }>(
    stream: FakeLinearStream,
    all: readonly T[],
    window: LinearWindow,
    after: string | null,
  ): LinearPage<T> {
    this.requests += 1;
    this.windows.push({ stream, window });
    const failure = this.failures[stream];
    if (failure) throw failure;
    if (this.failureAtCursor?.stream === stream && this.failureAtCursor.after === after) {
      throw this.failureAtCursor.error;
    }
    if (this.staleCursorOnce?.stream === stream && this.staleCursorOnce.after === after) {
      this.staleCursorOnce = null;
      throw new LinearRequestError('linear_cursor_invalid');
    }
    const inWindow = all.filter((node) => {
      const updated = Date.parse(node.updatedAt);
      return updated > window.gtMs && updated <= window.lteMs;
    });
    const start = after === null ? 0 : Number(after);
    const end = Math.min(start + this.pageSize, inWindow.length);
    return {
      nodes: inWindow.slice(start, end),
      pageInfo: { hasNextPage: end < inWindow.length, endCursor: String(end) },
    };
  }
}

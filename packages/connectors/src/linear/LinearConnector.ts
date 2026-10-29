// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor } from '../connector.js';
import type {
  NormalizedContainer,
  NormalizedFact,
  NormalizedRecords,
  NormalizedResource,
} from '../normalized.js';
import { LinearRateLimitedError, LinearRequestError, type LinearApiClient } from './client.js';
import {
  normalizeLinearPulledComment,
  normalizeLinearPulledCycle,
  normalizeLinearPulledIssue,
  normalizeLinearPulledProject,
} from './normalize.js';
import {
  LINEAR_PULL_STREAMS,
  readLinearPullCursor,
  writeLinearPullCursor,
  type LinearPullPosition,
  type LinearPullStream,
  type LinearStreamPosition,
} from './pull-cursor.js';
import { readLinearStream, type LinearStreamResult } from './stream-reader.js';
import type { LinearHistoryNode, LinearIssueNode, LinearPage, LinearTeamNode } from './types.js';

const LINEAR_MAX_REQUESTS_PER_PULL = 200;
const LINEAR_COMPLEXITY_HEADROOM = 20_000;
const LINEAR_REQUEST_HEADROOM = 100;
export const LINEAR_DEFAULT_LOOKBACK_MS = 365 * 86_400_000;

interface PullCollector {
  readonly facts: NormalizedFact[];
  readonly containers: Map<string, NormalizedContainer>;
}

interface CollectorMark {
  readonly factCount: number;
  readonly containerKeys: ReadonlySet<string>;
}

interface PullRun {
  readonly position: LinearPullPosition;
  readonly floorMs: number;
  readonly startedAtMs: number;
  readonly collector: PullCollector;
}

export class LinearConnector extends BaseConnector {
  readonly kind = 'linear';

  constructor(
    context: ConnectorContext,
    private readonly client: LinearApiClient,
    private readonly now: () => Date = () => new Date(),
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    const teams = await this.call('list_teams', () => this.allTeams());
    return teams.map((team) => ({
      externalId: team.id,
      resourceType: 'team',
      isPublic: !team.private,
      displayName: team.name,
    }));
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const startedAtMs = this.now().getTime();
    let remaining = options?.maxFacts ?? Number.POSITIVE_INFINITY;
    const run: PullRun = {
      position: readLinearPullCursor(cursor.value),
      floorMs: options?.since?.getTime() ?? startedAtMs - LINEAR_DEFAULT_LOOKBACK_MS,
      startedAtMs,
      collector: { facts: [], containers: new Map() },
    };
    const next: Record<LinearPullStream, LinearStreamPosition> = { ...run.position };
    let hasMore = false;
    let firstFailure: unknown = null;
    let succeeded = 0;
    let guardStopped = false;

    for (const stream of LINEAR_PULL_STREAMS) {
      if (remaining <= 0) {
        hasMore = true;
        break;
      }
      const outcome = await this.pullStream(stream, run, remaining);
      if ('failure' in outcome) {
        firstFailure ??= outcome.failure;
        continue;
      }
      succeeded += 1;
      next[stream] = outcome.position;
      remaining -= outcome.spent;
      if (outcome.stop !== 'caught_up') hasMore = true;
      if (outcome.stop === 'guard') guardStopped = true;
      if (outcome.stop === 'guard' || outcome.stop === 'rate_limited') break;
    }

    if (succeeded === 0 && firstFailure !== null) throw this.mapError('pull', firstFailure);
    if (guardStopped && run.collector.facts.length === 0) {
      throw this.mapError('pull', new LinearRateLimitedError());
    }
    this.logger.debug('linear_pull_complete');
    return {
      facts: run.collector.facts,
      containers: [...run.collector.containers.values()],
      cursor: { value: writeLinearPullCursor(next) },
      hasMore,
    };
  }

  // Not yet wired: Linear is pull-only, so a webhook delivery produces no records.
  normalizeWebhook(): NormalizedRecords {
    return { facts: [], containers: [] };
  }

  private async pullStream(
    stream: LinearPullStream,
    run: PullRun,
    budget: number,
  ): Promise<LinearStreamResult | { readonly failure: LinearRequestError }> {
    const mark = this.markCollector(run.collector);
    try {
      return await this.call(`pull_${stream}`, () => this.readStream(stream, run, budget, mark));
    } catch (error) {
      const failure = (error as { cause?: unknown }).cause;
      if (!(failure instanceof LinearRequestError) || failure.code === 'linear_unauthorized') {
        throw error;
      }
      this.rollBack(run.collector, mark);
      this.logger.warn('linear_stream_failed', {
        operation: `pull_${stream}`,
        errorCode: failure.code,
      });
      return { failure };
    }
  }

  private readStream(
    stream: LinearPullStream,
    run: PullRun,
    budget: number,
    mark: CollectorMark,
  ): Promise<LinearStreamResult> {
    const common = {
      position: run.position[stream],
      floorMs: run.floorMs,
      startedAtMs: run.startedAtMs,
      budget,
      guard: () => this.isGuardTripped(),
      collectedBefore: mark.factCount,
      discardCollected: () => this.rollBack(run.collector, mark),
    };
    const collector = run.collector;
    switch (stream) {
      case 'projects':
        return readLinearStream({
          ...common,
          fetchPage: (window, after) => this.client.projects(window, after),
          emit: async (node, bounds) =>
            this.collect(collector, normalizeLinearPulledProject(node, bounds)),
        });
      case 'cycles':
        return readLinearStream({
          ...common,
          fetchPage: (window, after) => this.client.cycles(window, after),
          emit: async (node, bounds) =>
            this.collect(collector, normalizeLinearPulledCycle(node, bounds)),
        });
      case 'issues':
        return readLinearStream({
          ...common,
          fetchPage: (window, after) => this.client.issues(window, after),
          emit: async (node, bounds) =>
            this.collect(
              collector,
              normalizeLinearPulledIssue(node, await this.fullHistory(node), bounds),
            ),
        });
      case 'comments':
        return readLinearStream({
          ...common,
          fetchPage: (window, after) => this.client.comments(window, after),
          emit: async (node, bounds) =>
            this.collect(collector, normalizeLinearPulledComment(node, bounds)),
        });
    }
  }

  private markCollector(collector: PullCollector): CollectorMark {
    return {
      factCount: collector.facts.length,
      containerKeys: new Set(collector.containers.keys()),
    };
  }

  private rollBack(collector: PullCollector, mark: CollectorMark): void {
    collector.facts.length = mark.factCount;
    for (const key of [...collector.containers.keys()]) {
      if (!mark.containerKeys.has(key)) collector.containers.delete(key);
    }
  }

  private collect(collector: PullCollector, records: NormalizedRecords): number {
    collector.facts.push(...records.facts);
    for (const container of records.containers) {
      collector.containers.set(container.sourceContainerId, container);
    }
    return records.facts.length;
  }

  private async allTeams(): Promise<LinearTeamNode[]> {
    const teams: LinearTeamNode[] = [];
    let after: string | null = null;
    do {
      const page: LinearPage<LinearTeamNode> = await this.client.teams(after);
      teams.push(...page.nodes);
      after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    } while (after !== null);
    return teams;
  }

  private async fullHistory(issue: LinearIssueNode): Promise<LinearHistoryNode[]> {
    const nodes = [...issue.history.nodes];
    let pageInfo = issue.history.pageInfo;
    while (pageInfo.hasNextPage && pageInfo.endCursor !== null) {
      const page = await this.client.issueHistory(issue.id, pageInfo.endCursor);
      nodes.push(...page.nodes);
      pageInfo = page.pageInfo;
    }
    return nodes;
  }

  private isGuardTripped(): boolean {
    const state = this.client.rateState();
    return (
      state.requestsMade >= LINEAR_MAX_REQUESTS_PER_PULL ||
      (state.complexityRemaining ?? Number.POSITIVE_INFINITY) < LINEAR_COMPLEXITY_HEADROOM ||
      (state.requestsRemaining ?? Number.POSITIVE_INFINITY) < LINEAR_REQUEST_HEADROOM
    );
  }
}

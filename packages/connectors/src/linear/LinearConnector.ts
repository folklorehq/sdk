// SPDX-License-Identifier: Apache-2.0
import type { AppError } from '@folklore/errors';
import { BaseConnector } from '../BaseConnector.js';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '../connector.js';
import type { NormalizedFact, NormalizedRecords, NormalizedResource } from '../normalized.js';
import { isCreateEvent } from '../pull-classification.js';
import type { LinearApiClient } from './client.js';
import { normalizeLinearCommentEvent, normalizeLinearIssueEvent } from './normalize.js';
import type { LinearCommentEvent, LinearIssueEvent } from './types.js';

// @linear/sdk inspects extensions.type, but Linear actually sends extensions.code —
// so the SDK never surfaces this as a rate-limit error on its own.
const LINEAR_RATE_LIMIT_CODE = 'RATELIMITED';

interface LinearErrorLike {
  raw?: {
    response?: {
      errors?: Array<{ extensions?: { code?: string } }>;
    };
  };
}

export class LinearConnector extends BaseConnector {
  readonly kind = 'linear';

  constructor(
    context: ConnectorContext,
    private readonly client: LinearApiClient,
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    return [];
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const since = cursor.value ?? options?.since?.toISOString();
    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];
    let maxUpdatedAt = cursor.value;

    const issues = await this.call('listIssues', () => this.client.listIssues(since));

    for (const issue of issues) {
      const event: LinearIssueEvent = {
        action: isCreateEvent(issue.createdAt, since) ? 'create' : 'update',
        data: issue,
        type: 'Issue',
        createdAt: issue.createdAt,
        organizationId: issue.team.id,
      };
      const normalized = normalizeLinearIssueEvent(event);
      facts.push(...normalized.facts);
      containers.push(...normalized.containers);

      const comments = await this.call('listComments', () =>
        this.client.listComments(issue.id, since),
      );
      for (const comment of comments) {
        const commentEvent: LinearCommentEvent = {
          action: 'create',
          data: comment,
          type: 'Comment',
          createdAt: comment.createdAt,
          organizationId: issue.team.id,
        };
        facts.push(...normalizeLinearCommentEvent(commentEvent).facts);
      }

      if (maxUpdatedAt === null || issue.updatedAt > maxUpdatedAt) {
        maxUpdatedAt = issue.updatedAt;
      }
    }

    this.logger.debug('linear_pull_complete');
    return { facts, containers, cursor: { value: maxUpdatedAt }, hasMore: false };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const payload = event.payload as { type?: string };
    if (payload.type === 'Issue') {
      return normalizeLinearIssueEvent(payload as LinearIssueEvent);
    }
    if (payload.type === 'Comment') {
      return normalizeLinearCommentEvent(payload as LinearCommentEvent);
    }
    return { containers: [], facts: [] };
  }

  protected override mapError(operation: string, err: unknown): AppError {
    return this.isLinearRateLimited(err)
      ? this.rateLimitError(operation, err)
      : super.mapError(operation, err);
  }

  private isLinearRateLimited(err: unknown): boolean {
    const errors = (err as LinearErrorLike | null)?.raw?.response?.errors;
    return (
      Array.isArray(errors) &&
      errors.some((error) => error.extensions?.code === LINEAR_RATE_LIMIT_CODE)
    );
  }
}

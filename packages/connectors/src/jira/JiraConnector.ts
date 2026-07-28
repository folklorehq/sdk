// SPDX-License-Identifier: Apache-2.0
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
import type { JiraApiClient } from './client.js';
import {
  normalizeJiraCommentEvent,
  normalizeJiraIssueEvent,
  projectToResource,
} from './normalize.js';
import type { JiraCommentEvent, JiraIssue, JiraIssueEvent } from './types.js';

export class JiraConnector extends BaseConnector {
  readonly kind = 'jira';

  constructor(
    context: ConnectorContext,
    private readonly client: JiraApiClient,
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    const projects = await this.call('listProjects', () => this.client.listProjects());
    return projects.map(projectToResource);
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const since = cursor.value ?? options?.since?.toISOString();
    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];
    let maxUpdatedAt = cursor.value;

    const issues = await this.call('listIssues', () => this.client.listIssues(since));

    for (const issue of issues) {
      const normalized = normalizeJiraIssueEvent(this.issueEvent(issue, since));
      facts.push(...normalized.facts);
      containers.push(...normalized.containers);

      const comments = await this.call('listComments', () =>
        this.client.listComments(issue.key, since),
      );
      for (const comment of comments) {
        const event: JiraCommentEvent = {
          webhookEvent: 'comment_created',
          issue,
          comment,
        };
        facts.push(...normalizeJiraCommentEvent(event).facts);
      }

      if (maxUpdatedAt === null || issue.fields.updated > maxUpdatedAt) {
        maxUpdatedAt = issue.fields.updated;
      }
    }

    this.logger.debug('jira pull complete', { facts: facts.length, issues: issues.length });
    return { facts, containers, cursor: { value: maxUpdatedAt }, hasMore: false };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const payload = event.payload as { webhookEvent?: string };
    switch (payload.webhookEvent) {
      case 'jira:issue_created':
      case 'jira:issue_updated':
        return normalizeJiraIssueEvent(payload as JiraIssueEvent);
      case 'comment_created':
      case 'comment_updated':
        return normalizeJiraCommentEvent(payload as JiraCommentEvent);
      default:
        return { containers: [], facts: [] };
    }
  }

  // Classify per issue, not per pull mode: the enclave always sets a 12-month `since`, so an
  // issue born inside the window is a create (container + seed) while an older one only touched
  // in the window is an update.
  private issueEvent(issue: JiraIssue, since: string | undefined): JiraIssueEvent {
    return {
      webhookEvent: isCreateEvent(issue.fields.created, since)
        ? 'jira:issue_created'
        : 'jira:issue_updated',
      issue,
    };
  }
}

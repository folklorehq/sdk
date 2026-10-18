// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { takeOldestWithinBudget } from '../budgeted-pull.js';
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
import { readJiraPullCursor, writeJiraPullCursor } from './pull-cursor.js';
import type { JiraCommentEvent, JiraIssue, JiraIssueEvent } from './types.js';

const MS_PER_HOUR = 3_600_000;
const COLONLESS_OFFSET_RE = /([+-]\d{2})(\d{2})$/;

/** JQL reads dates in the OAuth user's timezone (up to ±14 h); the lower bound is widened by that much and the exact watermark is applied client-side. */
export const JIRA_JQL_TIMEZONE_MARGIN_MS = 14 * MS_PER_HOUR;

export function jiraUpdatedMs(value: string): number {
  const ms = Date.parse(value.replace(COLONLESS_OFFSET_RE, '$1:$2'));
  if (!Number.isFinite(ms)) throw new Error('jira_timestamp_invalid');
  return ms;
}

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
    const position = readJiraPullCursor(cursor.value, options?.since?.toISOString() ?? null);
    const resumeAtMs = position.updated === null ? null : jiraUpdatedMs(position.updated);
    const since = position.since ?? undefined;
    const records = new Map<string, NormalizedRecords>();
    const recordsOf = (issue: JiraIssue) => this.cachedIssueRecords(records, issue, since);
    // The take is not wrapped in `call`: nesting would hide a RateLimitError behind an ExternalServiceError.
    const take = await takeOldestWithinBudget(this.issuePages(this.jqlSince(resumeAtMs, options)), {
      resumeAtMs,
      beforeResume: 'skip',
      budget: options?.maxFacts ?? Number.POSITIVE_INFINITY,
      atMs: (issue) => jiraUpdatedMs(issue.fields.updated),
      cost: async (issue) => (await recordsOf(issue)).facts.length,
    });

    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];
    for (const issue of take.taken) {
      const taken = await recordsOf(issue);
      facts.push(...taken.facts);
      containers.push(...taken.containers);
    }

    this.logger.debug('jira_pull_complete');
    const hasMore = !take.exhausted;
    const updated = take.taken.at(-1)?.fields.updated ?? position.updated;
    return {
      facts,
      containers,
      cursor: { value: writeJiraPullCursor({ updated, since: position.since }, hasMore) },
      hasMore,
    };
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

  private jqlSince(resumeAtMs: number | null, options?: PullOptions): string | undefined {
    return resumeAtMs === null
      ? options?.since?.toISOString()
      : new Date(resumeAtMs - JIRA_JQL_TIMEZONE_MARGIN_MS).toISOString();
  }

  private async *issuePages(since: string | undefined): AsyncIterable<readonly JiraIssue[]> {
    const pages = this.client.pageIssuesUpdatedSince(since)[Symbol.asyncIterator]();
    try {
      for (;;) {
        const step = await this.call('listIssues', () => pages.next());
        if (step.done) return;
        yield step.value;
      }
    } finally {
      await pages.return?.();
    }
  }

  private async cachedIssueRecords(
    cache: Map<string, NormalizedRecords>,
    issue: JiraIssue,
    since: string | undefined,
  ): Promise<NormalizedRecords> {
    const cached = cache.get(issue.id);
    if (cached !== undefined) return cached;
    const records = await this.issueRecords(issue, since);
    cache.set(issue.id, records);
    return records;
  }

  private async issueRecords(
    issue: JiraIssue,
    since: string | undefined,
  ): Promise<NormalizedRecords> {
    const normalized = normalizeJiraIssueEvent(this.issueEvent(issue, since));
    const comments = await this.call('listComments', () =>
      this.client.listComments(issue.key, since),
    );
    const commentFacts = comments.flatMap((comment) => {
      const event: JiraCommentEvent = { webhookEvent: 'comment_created', issue, comment };
      return normalizeJiraCommentEvent(event).facts;
    });
    return { facts: [...normalized.facts, ...commentFacts], containers: normalized.containers };
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

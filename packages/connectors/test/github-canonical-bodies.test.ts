// SPDX-License-Identifier: Apache-2.0
import { PinoLogger } from '@folklore/logger';
import { describe, expect, it } from 'vitest';
import { GitHubConnector } from '../src/github/GitHubConnector.js';
import type { GitHubClient } from '../src/github/client.js';
import { normalizeIssueCommentEvent, normalizePullRequestEvent } from '../src/github/normalize.js';
import type {
  GitHubIssueComment,
  GitHubPullRequest,
  IssueCommentEvent,
  PullRequestEvent,
} from '../src/github/types.js';
import type { NormalizedFact } from '../src/normalized.js';
import { repo } from './fixtures/github.js';

const context = { logger: new PinoLogger({ level: 'silent' }) };

const CLOSED_AT = '2026-06-03T12:00:00Z';
const LATER_UPDATE = '2026-06-09T00:00:00Z';

const openPr: GitHubPullRequest = {
  id: 1001,
  number: 7,
  title: 'Add connectors',
  body: 'Implements the framework. See #3',
  state: 'open',
  user: { id: 5, login: 'dev7' },
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
};
const mergedPr: GitHubPullRequest = {
  ...openPr,
  state: 'closed',
  merged: true,
  closed_at: CLOSED_AT,
  updated_at: CLOSED_AT,
};
const webhookUser = { id: 5, login: 'dev7', name: 'Dev Seven', email: 'dev7@example.com' };
const webhookExtras = { html_url: 'https://github.com/acme/widget/pull/7', labels: ['x'] };
const comment: GitHubIssueComment = {
  id: 900,
  body: 'ship it',
  user: { id: 6, login: 'rev' },
  created_at: '2026-06-02T09:00:00Z',
  updated_at: '2026-06-02T09:00:00Z',
};

function clientFor(pr: GitHubPullRequest, comments: GitHubIssueComment[]): GitHubClient {
  return {
    listRepositories: async () => [repo],
    listPullRequestsUpdatedSince: async () => [
      { pullRequest: pr, detail: { additions: 10, deletions: 3, changed_files: 2 } },
    ],
    listIssueCommentsUpdatedSince: async () =>
      comments.map((c) => ({ issueNumber: pr.number, comment: c })),
    getPullRequestFiles: async () => [],
  };
}

async function pulledFacts(
  pr: GitHubPullRequest,
  comments: GitHubIssueComment[] = [],
): Promise<NormalizedFact[]> {
  const connector = new GitHubConnector(context, clientFor(pr, comments));
  return (await connector.pull({ value: null })).facts;
}

function byId(facts: NormalizedFact[], sourceFactId: string): NormalizedFact {
  const fact = facts.find((f) => f.sourceFactId === sourceFactId);
  if (!fact) throw new Error(`missing ${sourceFactId}`);
  return fact;
}

function webhookPr(action: string, pr: GitHubPullRequest): NormalizedFact {
  const event = {
    action,
    repository: repo,
    pull_request: { ...pr, ...webhookExtras, updated_at: LATER_UPDATE, user: webhookUser },
  } as PullRequestEvent;
  const fact = normalizePullRequestEvent(event).facts[0];
  if (!fact) throw new Error('no fact');
  return fact;
}

function webhookComment(c: GitHubIssueComment): NormalizedFact {
  const event: IssueCommentEvent = {
    action: 'created',
    repository: repo,
    issue: { number: 7, pull_request: {} },
    comment: { ...c, user: { ...c.user, name: 'Rev Six', email: 'rev@example.com' } },
  };
  const fact = normalizeIssueCommentEvent(event).facts[0];
  if (!fact) throw new Error('no fact');
  return fact;
}

async function allTransportFacts(): Promise<NormalizedFact[]> {
  return [
    ...(await pulledFacts(mergedPr, [comment])),
    webhookPr('opened', openPr),
    webhookPr('closed', mergedPr),
    webhookComment(comment),
  ];
}

describe('transport-identical fact bodies', () => {
  it('pr_opened is identical from a webhook and a pull', async () => {
    const pulled = byId(await pulledFacts(openPr), 'github:pr_opened:1001');
    expect(JSON.stringify(webhookPr('opened', openPr))).toBe(JSON.stringify(pulled));
  });

  it('a merged transition is identical from a webhook and a pull', async () => {
    const pulled = byId(await pulledFacts(mergedPr), `github:pr_merged:1001:${CLOSED_AT}`);
    expect(JSON.stringify(webhookPr('closed', mergedPr))).toBe(JSON.stringify(pulled));
  });

  it('an unedited comment is identical from a webhook and a pull', async () => {
    const pulled = byId(await pulledFacts(openPr, [comment]), 'github:comment:900');
    expect(JSON.stringify(webhookComment(comment))).toBe(JSON.stringify(pulled));
  });

  it('an edited comment gets its own key and occurredAt', async () => {
    const edited = { ...comment, updated_at: '2026-06-04T09:00:00Z' };
    const fact = byId(
      await pulledFacts(openPr, [edited]),
      `github:comment:edited:900:${edited.updated_at}`,
    );
    expect(fact.occurredAt).toEqual(new Date(edited.updated_at));
  });

  it('pr_opened bytes do not change when a comment arrives between pulls', async () => {
    const first = byId(await pulledFacts(openPr), 'github:pr_opened:1001');
    const second = byId(await pulledFacts(openPr, [comment]), 'github:pr_opened:1001');
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('raw is a fixed content-free projection', async () => {
    const facts = await allTransportFacts();
    const rawKeys = (prefix: string) =>
      Object.keys(facts.find((f) => f.sourceFactId.startsWith(prefix))?.raw as object).sort();
    expect(rawKeys('github:pr_opened:')).toEqual(['id', 'number']);
    expect(rawKeys('github:pr_merged:')).toEqual(['closed_at', 'id', 'merged', 'number']);
    expect(rawKeys('github:comment:')).toEqual(['id']);
  });

  it('PR and comment authors carry the login only, never an email or profile name', async () => {
    for (const fact of await allTransportFacts()) {
      const author = JSON.parse(JSON.stringify(fact)).authors[0];
      expect('email' in author).toBe(false);
      expect(['dev7', 'rev']).toContain(author.displayName);
    }
  });
});

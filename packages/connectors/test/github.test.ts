// SPDX-License-Identifier: Apache-2.0
import { PinoLogger } from '@folklore/logger';
import { describe, expect, it } from 'vitest';
import type { ConnectorContext } from '../src/index.js';
import { GitHubConnector } from '../src/github/GitHubConnector.js';
import type { GitHubClient } from '../src/github/client.js';
import {
  normalizeCommit,
  normalizeIssueComment,
  normalizePullRequest,
  normalizePullRequestEvent,
  normalizePullRequestTransition,
  pullRequestContainerId,
} from '../src/github/normalize.js';
import type {
  GitHubIssueComment,
  GitHubPullRequest,
  GitHubRepo,
  PullRequestEvent,
} from '../src/github/types.js';
import { pr, repo } from './fixtures/github.js';

const context: ConnectorContext = { logger: new PinoLogger({ level: 'silent' }) };

describe('Fact vs. Container classification', () => {
  it('maps a PR to a stateful Container + a seed content Fact', () => {
    const { container, fact } = normalizePullRequest(repo, pr);

    expect(container).toMatchObject({
      sourceContainerId: 'acme/widget#7',
      shape: 'stateful',
      label: 'github_pr',
      resourceExternalId: '42',
    });
    expect(fact.kind).toBe('content');
    expect(fact.sourceFactId).toBe('github:pr_opened:1001');
    expect(fact.containerRefs).toEqual(['acme/widget#7']);
    expect(fact.authors[0]).toMatchObject({ sourceUserId: '5', displayName: 'Nate A' });
    expect(fact.content?.explicitLinks).toContain('acme/widget#3');
  });

  it('exposes repo full_name + PR ref as structured entities, never the branch (#68)', () => {
    const withBranch = {
      ...pr,
      head: { ref: 'nate/secret-codename', sha: 'deadbeef' },
    } as GitHubPullRequest;
    const { fact } = normalizePullRequest(repo, withBranch);
    expect(fact.entities).toEqual(['acme/widget', 'PR#7']);
    expect(fact.entities?.some((e) => e.includes('secret-codename'))).toBe(false);
  });

  it('captures a commit changed-files list as structured entities', () => {
    const fact = normalizeCommit(repo, {
      sha: 'abc123',
      message: 'fix: thing',
      author: { id: 5, login: 'nate' },
      timestamp: '2026-06-02T08:00:00Z',
      added: ['src/new.ts'],
      modified: ['src/server/auth.ts'],
      removed: ['old/legacy.ts'],
    });
    expect(fact.entities).toContain('acme/widget');
    expect(fact.entities).toContain('src/server/auth.ts');
    expect(fact.entities).toContain('src/new.ts');
    expect(fact.entities).toContain('old/legacy.ts');
  });

  it('maps a comment to a content Fact inside the PR container', () => {
    const comment: GitHubIssueComment = {
      id: 900,
      body: 'LGTM',
      user: { id: 6, login: 'rev' },
      created_at: '2026-06-02T09:00:00Z',
    };
    const fact = normalizeIssueComment(repo, pr.number, comment);
    expect(fact.kind).toBe('content');
    expect(fact.sourceFactId).toBe('github:comment:900');
    expect(fact.containerRefs).toEqual(['acme/widget#7']);
  });

  it('maps a commit to a content Fact with no container (resolved later)', () => {
    const fact = normalizeCommit(repo, {
      sha: 'abc123',
      message: 'fix: thing',
      author: { id: 5, login: 'nate' },
      timestamp: '2026-06-02T08:00:00Z',
    });
    expect(fact.sourceFactId).toBe('github:commit:abc123');
    expect(fact.containerRefs).toEqual([]);
  });
});

describe('explicit links use the referenced container key', () => {
  const otherRepo: GitHubRepo = { id: 43, full_name: 'acme/gadget', private: true };
  const referenced = [
    pullRequestContainerId(repo, 12),
    pullRequestContainerId(otherRepo, 45),
    pullRequestContainerId(repo, 31),
    pullRequestContainerId(repo, 418),
  ];
  const body =
    'Fixes #12, closes acme/gadget#45, follow-up to https://github.com/acme/widget/pull/31/files (#418)';

  it('keys a PR body the way the referenced PR containers are keyed', () => {
    const { fact } = normalizePullRequest(repo, { ...pr, body });
    expect(fact.content?.explicitLinks).toEqual(expect.arrayContaining(referenced));
  });

  it('keys a PR comment the same way', () => {
    const fact = normalizeIssueComment(repo, pr.number, {
      id: 901,
      body,
      user: { id: 6, login: 'rev' },
      created_at: '2026-06-02T09:00:00Z',
    });
    expect(fact.content?.explicitLinks).toEqual(expect.arrayContaining(referenced));
  });

  it('keys a squash-merge commit title to the PR that merged it', () => {
    const fact = normalizeCommit(repo, {
      sha: 'abc124',
      message: 'feat(api): retry uploads (#418)',
      author: { id: 5, login: 'nate' },
      timestamp: '2026-06-02T08:00:00Z',
    });
    expect(fact.content?.explicitLinks).toEqual([pullRequestContainerId(repo, 418)]);
  });

  it('never keys a bare #N to the same number in another repo', () => {
    const { fact } = normalizePullRequest(repo, { ...pr, body: 'Fixes #45' });
    expect(fact.content?.explicitLinks).toEqual([pullRequestContainerId(repo, 45)]);
    expect(fact.content?.explicitLinks).not.toContain(pullRequestContainerId(otherRepo, 45));
  });
});

describe('transition Facts', () => {
  it('emits a merged transition Fact on a merged-close event', () => {
    const event: PullRequestEvent = {
      action: 'closed',
      repository: repo,
      pull_request: { ...pr, state: 'closed', merged: true, closed_at: '2026-06-03T12:00:00Z' },
    };
    const { facts, containers } = normalizePullRequestEvent(event);
    expect(containers).toHaveLength(0);
    expect(facts[0]?.kind).toBe('transition');
    expect(facts[0]?.transition).toMatchObject({
      transitionType: 'merged',
      detail: { field: 'state', from: 'open', to: 'merged' },
    });
  });
});

describe('fact_metrics (method 6, content-free numeric signals)', () => {
  it('attaches exact PR-opened diff + comment metrics', () => {
    const { fact } = normalizePullRequest(repo, pr, {
      additions: 128,
      deletions: 12,
      changedFiles: 9,
      commentCount: 4,
    });
    expect(fact.metrics).toEqual([
      { key: 'github.pr.additions', value: 128, unit: 'lines' },
      { key: 'github.pr.deletions', value: 12, unit: 'lines' },
      { key: 'github.pr.changed_files', value: 9, unit: 'files' },
      { key: 'github.pr.comment_count', value: 4, unit: 'count' },
    ]);
  });

  it('omits metrics on the PR-opened fact when no diff counts are provided', () => {
    const { fact } = normalizePullRequest(repo, pr);
    expect(fact.metrics).toBeUndefined();
  });

  it('attaches time_to_merge_seconds only on a merged transition', () => {
    const merged = normalizePullRequestTransition(
      repo,
      { ...pr, state: 'closed', merged: true, closed_at: '2026-06-01T11:30:00Z' },
      'closed',
    );
    expect(merged.metrics).toEqual([
      { key: 'github.pr.time_to_merge_seconds', value: 5400, unit: 'seconds' },
    ]);

    const closedUnmerged = normalizePullRequestTransition(
      repo,
      { ...pr, state: 'closed', merged: false, closed_at: '2026-06-01T11:30:00Z' },
      'closed',
    );
    expect(closedUnmerged.metrics).toBeUndefined();
  });

  it('counts commit changed files without carrying any filename', () => {
    const fact = normalizeCommit(repo, {
      sha: 'abc123',
      message: 'fix: thing',
      author: { id: 5, login: 'nate' },
      timestamp: '2026-06-02T08:00:00Z',
      added: ['src/new.ts'],
      modified: ['src/server/auth.ts'],
      removed: ['old/legacy.ts'],
    });
    expect(fact.metrics).toEqual([{ key: 'github.commit.changed_files', value: 3, unit: 'files' }]);
  });

  it('never leaks a filename or patch text into fact.metrics (trust boundary)', () => {
    const secretFilename = 'src/server/secret-auth.ts';
    const secretPatch = '@@ -1 +1 @@ leaked patch body';
    const commitFact = normalizeCommit(repo, {
      sha: 'deadbeef',
      message: 'chore: edit',
      author: { id: 5, login: 'nate' },
      timestamp: '2026-06-02T08:00:00Z',
      modified: [secretFilename],
    });
    const { fact: prFact } = normalizePullRequest(repo, pr, {
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      commentCount: 0,
    });

    for (const metrics of [commitFact.metrics, prFact.metrics]) {
      const serialized = JSON.stringify(metrics);
      expect(serialized).not.toContain(secretFilename);
      expect(serialized).not.toContain('secret-auth');
      expect(serialized).not.toContain(secretPatch);
      expect(serialized).not.toContain('.ts');
      for (const m of metrics ?? []) {
        expect(typeof m.value).toBe('number');
        expect(m.key.startsWith('github.')).toBe(true);
      }
    }
  });
});

describe('GitHubConnector.pull', () => {
  it('treats an empty incremental response as successful and preserves its cursor', async () => {
    const client: GitHubClient = {
      listRepositories: async () => [repo],
      listPullRequestsUpdatedSince: async () => [],
      listIssueCommentsUpdatedSince: async () => [],
      getPullRequestFiles: async () => [],
    };
    const connector = new GitHubConnector(context, client);

    const result = await connector.pull({ value: '2026-06-01T10:00:00Z' });

    expect(result.facts).toEqual([]);
    expect(result.containers).toEqual([]);
    expect(result.cursor.value).toBe('2026-06-01T10:00:00Z');
  });

  it('produces containers + facts and advances the cursor', async () => {
    const client: GitHubClient = {
      listRepositories: async () => [repo],
      listPullRequestsUpdatedSince: async () => [
        { pullRequest: pr, detail: { additions: 10, deletions: 3, changed_files: 2 } },
      ],
      listIssueCommentsUpdatedSince: async () => [
        {
          issueNumber: 7,
          comment: {
            id: 900,
            body: 'ship it',
            user: { id: 6, login: 'rev' },
            created_at: '2026-06-02T09:00:00Z',
          },
        },
        {
          issueNumber: 8,
          comment: {
            id: 901,
            body: 'plain issue comment',
            user: { id: 6, login: 'rev' },
            created_at: '2026-06-02T09:30:00Z',
          },
        },
      ],
      getPullRequestFiles: async () => [],
    };
    const connector = new GitHubConnector(context, client);
    const result = await connector.pull({ value: null });

    expect(result.containers).toHaveLength(1);
    expect(result.facts.map((f) => f.sourceFactId)).toEqual([
      'github:pr_opened:1001',
      'github:comment:900',
    ]);
    expect(result.cursor.value).toBe('2026-06-01T10:00:00Z');

    const opened = result.facts.find((f) => f.sourceFactId === 'github:pr_opened:1001');
    expect(opened?.metrics).toEqual([
      { key: 'github.pr.additions', value: 10, unit: 'lines' },
      { key: 'github.pr.deletions', value: 3, unit: 'lines' },
      { key: 'github.pr.changed_files', value: 2, unit: 'files' },
      { key: 'github.pr.comment_count', value: 1, unit: 'count' },
    ]);
  });

  it('maps transport rate limits to RateLimitError', async () => {
    const client: GitHubClient = {
      listRepositories: async () => {
        throw { status: 429 };
      },
      listPullRequestsUpdatedSince: async () => [],
      listIssueCommentsUpdatedSince: async () => [],
      getPullRequestFiles: async () => [],
    };
    const connector = new GitHubConnector(context, client);
    await expect(connector.pull({ value: null })).rejects.toMatchObject({
      code: 'rate_limit',
      component: 'github',
    });
  });
});

describe('GitHubConnector construction', () => {
  const client: GitHubClient = {
    listRepositories: async () => [],
    listPullRequestsUpdatedSince: async () => [],
    listIssueCommentsUpdatedSince: async () => [],
    getPullRequestFiles: async () => [],
  };

  it('constructs from injected context and client', () => {
    const connector = new GitHubConnector(context, client);
    expect(connector).toBeInstanceOf(GitHubConnector);
    expect(connector.kind).toBe('github');
  });
});

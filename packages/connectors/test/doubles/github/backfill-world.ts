// SPDX-License-Identifier: Apache-2.0
import type {
  FakeGitHubAuthor,
  FakeGitHubComment,
  FakeGitHubPullRequest,
  FakeGitHubRepository,
} from './FakeGitHubApi.js';

export const BACKFILL_SINCE = '2025-10-11T00:00:00.000Z';
const ACTIVE_PULL_REQUESTS = 230;
const OLD_PULL_REQUESTS = 110;
const ACTIVE_REPO = 'acme/widget';
const DORMANT_REPO = 'acme/dormant';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const SINCE_MS = Date.parse(BACKFILL_SINCE);
const BOT: FakeGitHubAuthor = { id: 49_699_333, login: 'dependabot[bot]', kind: 'Bot' };
const NON_PR_ISSUE_BASE = 5_000;
const NON_PR_ISSUE_COMMENTS = 60;

function iso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z');
}

function author(n: number): FakeGitHubAuthor | null {
  if (n % 11 === 0) return null;
  if (n % 13 === 0) return BOT;
  return { id: 1_000 + (n % 9), login: `dev${n % 9}`, kind: 'User' };
}

function pullRequest(n: number, updatedMs: number): FakeGitHubPullRequest {
  const merged = n % 5 === 0;
  const closed = merged || n % 7 === 0;
  return {
    id: 2_400_000_000 + n,
    number: n,
    title: `Change ${n}`,
    body: n % 4 === 0 ? null : `Body for ${n}, follows #${n - 1}`,
    state: closed ? 'closed' : 'open',
    merged,
    author: author(n),
    created_at: iso(updatedMs - (n % 6) * DAY_MS - HOUR_MS),
    updated_at: iso(updatedMs),
    closed_at: closed ? iso(updatedMs - HOUR_MS) : null,
    additions: n * 3,
    deletions: n % 17,
    changed_files: (n % 8) + 1,
  };
}

function activePullRequests(): FakeGitHubPullRequest[] {
  const total = ACTIVE_PULL_REQUESTS + OLD_PULL_REQUESTS;
  return Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const offset = n - OLD_PULL_REQUESTS;
    return pullRequest(n, SINCE_MS + offset * HOUR_MS - HOUR_MS / 2);
  });
}

function comment(
  id: number,
  issueNumber: number,
  createdMs: number,
  updatedMs = createdMs,
): FakeGitHubComment {
  return {
    id,
    issueNumber,
    body: `Comment ${id} on ${issueNumber}`,
    author: author(id),
    created_at: iso(createdMs),
    updated_at: iso(updatedMs),
  };
}

function activeComments(pullRequests: FakeGitHubPullRequest[]): FakeGitHubComment[] {
  const comments: FakeGitHubComment[] = [];
  let id = 7_000_000_000;
  for (const pr of pullRequests) {
    const updatedMs = Date.parse(pr.updated_at);
    if (pr.number % 3 !== 0) continue;
    comments.push(comment((id += 1), pr.number, updatedMs - 2 * HOUR_MS));
    comments.push(comment((id += 1), pr.number, updatedMs - 3 * DAY_MS, updatedMs - HOUR_MS));
  }
  for (let i = 0; i < NON_PR_ISSUE_COMMENTS; i += 1) {
    comments.push(comment((id += 1), NON_PR_ISSUE_BASE + i, SINCE_MS + i * HOUR_MS));
  }
  comments.push(comment((id += 1), 50, SINCE_MS - 40 * DAY_MS, SINCE_MS + DAY_MS));
  return comments;
}

function dormantRepository(): FakeGitHubRepository {
  const pullRequests = [1, 2, 3].map((n) => pullRequest(n, SINCE_MS - n * DAY_MS));
  return {
    id: 43,
    full_name: DORMANT_REPO,
    private: false,
    pullRequests,
    comments: [comment(8_000_000_001, 2, SINCE_MS - 5 * DAY_MS)],
  };
}

/** A two-repo world: one repo spans several pages either side of the window, one is fully dormant. */
export function buildBackfillWorld(): FakeGitHubRepository[] {
  const pullRequests = activePullRequests();
  return [
    {
      id: 42,
      full_name: ACTIVE_REPO,
      private: true,
      pullRequests,
      comments: activeComments(pullRequests),
    },
    dormantRepository(),
  ];
}

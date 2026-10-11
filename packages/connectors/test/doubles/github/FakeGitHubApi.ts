// SPDX-License-Identifier: Apache-2.0
export interface FakeGitHubAuthor {
  id: number;
  login: string;
  kind: 'User' | 'Bot';
}

export interface FakeGitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  merged: boolean;
  author: FakeGitHubAuthor | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  additions: number;
  deletions: number;
  changed_files: number;
}

export interface FakeGitHubComment {
  id: number;
  issueNumber: number;
  body: string;
  author: FakeGitHubAuthor | null;
  created_at: string;
  updated_at: string;
}

export interface FakeGitHubRepository {
  id: number;
  full_name: string;
  private: boolean;
  pullRequests: FakeGitHubPullRequest[];
  comments: FakeGitHubComment[];
}

export type FakeGitHubRoute =
  | 'installation-repositories'
  | 'pulls-list'
  | 'pulls-get'
  | 'issue-comments'
  | 'repo-comments'
  | 'graphql';

interface GraphqlRequest {
  query: string;
  variables: { owner: string; name: string; cursor?: string | null };
}

const API_BASE = 'https://api.github.com';
const DEFAULT_PAGE_SIZE = 30;
const GRAPHQL_PAGE_SIZE = 100;
const BOT_LOGIN_SUFFIX = '[bot]';

// Serves the REST and GraphQL GitHub endpoints the connector uses from one in-memory world, so the
// old per-PR REST path and the bulk path can be compared over identical underlying data.
export class FakeGitHubApi {
  readonly requests: FakeGitHubRoute[] = [];

  constructor(private readonly repositories: FakeGitHubRepository[]) {}

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (init?.method === 'POST' && url.pathname === '/graphql') {
      this.requests.push('graphql');
      return this.json(this.graphql(JSON.parse(String(init.body)) as GraphqlRequest));
    }
    return this.rest(url);
  };

  count(route: FakeGitHubRoute): number {
    return this.requests.filter((r) => r === route).length;
  }

  private rest(url: URL): Response {
    const path = url.pathname;
    if (path === '/installation/repositories') {
      this.requests.push('installation-repositories');
      const repositories = this.repositories.map((r) => ({
        id: r.id,
        full_name: r.full_name,
        private: r.private,
      }));
      return this.json({ total_count: repositories.length, repositories });
    }
    const match = /^\/repos\/([^/]+)\/([^/]+)\/(.+)$/.exec(path);
    if (!match) throw new Error(`unexpected route ${path}`);
    const repo = this.repository(`${match[1]}/${match[2]}`);
    const rest = match[3]!;
    if (rest === 'pulls') return this.pullsList(repo, url);
    if (rest === 'issues/comments') return this.repoComments(repo, url);
    const pullGet = /^pulls\/(\d+)$/.exec(rest);
    if (pullGet) return this.pullsGet(repo, Number(pullGet[1]));
    const issueComments = /^issues\/(\d+)\/comments$/.exec(rest);
    if (issueComments) return this.issueComments(repo, Number(issueComments[1]), url);
    throw new Error(`unexpected route ${path}`);
  }

  private pullsList(repo: FakeGitHubRepository, url: URL): Response {
    this.requests.push('pulls-list');
    const ordered = [...repo.pullRequests].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return this.page(
      url,
      ordered.map((pr) => this.restPull(pr)),
    );
  }

  private pullsGet(repo: FakeGitHubRepository, number: number): Response {
    this.requests.push('pulls-get');
    const pr = repo.pullRequests.find((candidate) => candidate.number === number);
    if (!pr) return new Response('{}', { status: 404 });
    return this.json({
      ...this.restPull(pr),
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
    });
  }

  private issueComments(repo: FakeGitHubRepository, number: number, url: URL): Response {
    this.requests.push('issue-comments');
    const comments = this.updatedSince(repo.comments, url)
      .filter((c) => c.issueNumber === number)
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id);
    return this.page(
      url,
      comments.map((c) => this.restComment(repo, c)),
    );
  }

  private repoComments(repo: FakeGitHubRepository, url: URL): Response {
    this.requests.push('repo-comments');
    const field = url.searchParams.get('sort') === 'updated' ? 'updated_at' : 'created_at';
    const descending = url.searchParams.has('sort') && url.searchParams.get('direction') === 'desc';
    const comments = this.updatedSince(repo.comments, url).sort(
      (a, b) => (a[field].localeCompare(b[field]) || a.id - b.id) * (descending ? -1 : 1),
    );
    return this.page(
      url,
      comments.map((c) => this.restComment(repo, c)),
    );
  }

  private graphql(request: GraphqlRequest): unknown {
    if (!/UPDATED_AT/.test(request.query) || !/DESC/.test(request.query)) {
      throw new Error('graphql pull request query must order by UPDATED_AT DESC');
    }
    const repo = this.repository(`${request.variables.owner}/${request.variables.name}`);
    const ordered = [...repo.pullRequests].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    const start = request.variables.cursor ? Number(request.variables.cursor) : 0;
    const end = start + GRAPHQL_PAGE_SIZE;
    return {
      data: {
        repository: {
          pullRequests: {
            nodes: ordered.slice(start, end).map((pr) => this.graphqlPull(pr)),
            pageInfo: { hasNextPage: end < ordered.length, endCursor: String(end) },
          },
        },
      },
    };
  }

  private graphqlPull(pr: FakeGitHubPullRequest): unknown {
    return {
      fullDatabaseId: String(pr.id),
      number: pr.number,
      title: pr.title,
      body: pr.body ?? '',
      state: pr.merged ? 'MERGED' : pr.state.toUpperCase(),
      merged: pr.merged,
      createdAt: pr.created_at,
      updatedAt: pr.updated_at,
      closedAt: pr.closed_at,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changed_files,
      author: pr.author
        ? {
            __typename: pr.author.kind,
            login:
              pr.author.kind === 'Bot'
                ? pr.author.login.slice(0, -BOT_LOGIN_SUFFIX.length)
                : pr.author.login,
            databaseId: pr.author.id,
          }
        : null,
    };
  }

  private restPull(pr: FakeGitHubPullRequest): Record<string, unknown> {
    return {
      id: pr.id,
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: pr.state,
      merged_at: pr.merged ? pr.closed_at : null,
      user: pr.author ? { id: pr.author.id, login: pr.author.login } : null,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      closed_at: pr.closed_at,
    };
  }

  private restComment(repo: FakeGitHubRepository, comment: FakeGitHubComment): unknown {
    return {
      id: comment.id,
      body: comment.body,
      user: comment.author ? { id: comment.author.id, login: comment.author.login } : null,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      issue_url: `${API_BASE}/repos/${repo.full_name}/issues/${comment.issueNumber}`,
    };
  }

  private updatedSince(comments: FakeGitHubComment[], url: URL): FakeGitHubComment[] {
    const since = url.searchParams.get('since');
    if (!since) return [...comments];
    return comments.filter((c) => Date.parse(c.updated_at) >= Date.parse(since));
  }

  private page(url: URL, items: unknown[]): Response {
    const perPage = Number(url.searchParams.get('per_page') ?? DEFAULT_PAGE_SIZE);
    const page = Number(url.searchParams.get('page') ?? 1);
    const slice = items.slice((page - 1) * perPage, page * perPage);
    const headers: Record<string, string> = {};
    if (page * perPage < items.length) {
      const next = new URL(url);
      next.searchParams.set('page', String(page + 1));
      headers['link'] = `<${next.toString()}>; rel="next"`;
    }
    return this.json(slice, headers);
  }

  private repository(fullName: string): FakeGitHubRepository {
    const repo = this.repositories.find((r) => r.full_name === fullName);
    if (!repo) throw new Error(`unknown repository ${fullName}`);
    return repo;
  }

  private json(body: unknown, headers: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
    });
  }
}

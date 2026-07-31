// SPDX-License-Identifier: Apache-2.0
import { LinearClient } from '@linear/sdk';
import { BaseApiClient } from '../BaseApiClient.js';
import type { LinearApiClient } from './client.js';
import type { LinearComment, LinearIssue } from './types.js';

export class LinearSdkClient extends BaseApiClient implements LinearApiClient {
  private readonly sdk: LinearClient;

  constructor(token: string) {
    super(token);
    // token is an OAuth access token, not a personal API key —
    // apiKey sends a bare Authorization header, accessToken sends "Bearer <token>".
    this.sdk = new LinearClient({ accessToken: this.token });
  }

  async listIssues(updatedSince?: string): Promise<LinearIssue[]> {
    const issues: LinearIssue[] = [];
    const filter = updatedSince ? { updatedAt: { gt: new Date(updatedSince) } } : undefined;
    let connection = await this.sdk.issues({ filter, first: 100 });

    while (true) {
      for (const issue of connection.nodes) {
        const state = await issue.state;
        const team = await issue.team;
        const assignee = await issue.assignee;
        if (!state || !team) continue;
        issues.push({
          id: issue.id,
          number: issue.number,
          title: issue.title,
          description: issue.description ?? undefined,
          priority: issue.priority,
          state: { name: state.name, type: state.type as LinearIssue['state']['type'] },
          assignee: assignee
            ? { id: assignee.id, name: assignee.name, email: assignee.email ?? undefined }
            : undefined,
          team: { id: team.id, name: team.name, key: team.key },
          createdAt: issue.createdAt.toISOString(),
          updatedAt: issue.updatedAt.toISOString(),
        });
      }
      if (!connection.pageInfo.hasNextPage) break;
      connection = await connection.fetchNext();
    }

    return issues;
  }

  async listComments(issueId: string, updatedSince?: string): Promise<LinearComment[]> {
    const issue = await this.sdk.issue(issueId);
    const filter = updatedSince ? { createdAt: { gt: new Date(updatedSince) } } : undefined;
    let connection = await issue.comments({ filter, first: 100 });
    const comments: LinearComment[] = [];

    while (true) {
      for (const comment of connection.nodes) {
        const user = await comment.user;
        const parentIssue = await comment.issue;
        const parentTeam = parentIssue ? await parentIssue.team : undefined;
        if (!user || !parentIssue || !parentTeam) continue;
        comments.push({
          id: comment.id,
          body: comment.body,
          issue: {
            id: parentIssue.id,
            number: parentIssue.number,
            team: { id: parentTeam.id, name: parentTeam.name, key: parentTeam.key },
          },
          user: { id: user.id, name: user.name, email: user.email ?? undefined },
          createdAt: comment.createdAt.toISOString(),
        });
      }
      if (!connection.pageInfo.hasNextPage) break;
      connection = await connection.fetchNext();
    }

    return comments;
  }
}

// SPDX-License-Identifier: Apache-2.0
import type { JiraComment, JiraIssue, JiraProject } from './types.js';

export interface JiraApiClient {
  listProjects(): Promise<JiraProject[]>;
  pageIssuesUpdatedSince(updatedSince?: string): AsyncIterable<readonly JiraIssue[]>;
  listComments(issueKey: string, updatedSince?: string): Promise<JiraComment[]>;
}

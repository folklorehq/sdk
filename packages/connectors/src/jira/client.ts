// SPDX-License-Identifier: Apache-2.0
import type { JiraComment, JiraIssue, JiraProject } from './types.js';

export interface JiraApiClient {
  listProjects(): Promise<JiraProject[]>;
  listIssues(updatedSince?: string): Promise<JiraIssue[]>;
  listComments(issueKey: string, updatedSince?: string): Promise<JiraComment[]>;
}

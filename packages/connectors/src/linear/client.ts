// SPDX-License-Identifier: Apache-2.0
import type { LinearComment, LinearIssue } from './types.js';

export interface LinearApiClient {
  listIssues(updatedSince?: string): Promise<LinearIssue[]>;
  listComments(issueId: string, updatedSince?: string): Promise<LinearComment[]>;
}

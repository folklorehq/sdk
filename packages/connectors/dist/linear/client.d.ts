import type { LinearComment, LinearIssue } from './types.js';
export interface LinearApiClient {
    listIssues(updatedSince?: string): Promise<LinearIssue[]>;
    listComments(issueId: string, updatedSince?: string): Promise<LinearComment[]>;
}
//# sourceMappingURL=client.d.ts.map
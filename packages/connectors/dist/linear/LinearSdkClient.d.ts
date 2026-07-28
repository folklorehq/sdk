import { BaseApiClient } from '../BaseApiClient.js';
import type { LinearApiClient } from './client.js';
import type { LinearComment, LinearIssue } from './types.js';
export declare class LinearSdkClient extends BaseApiClient implements LinearApiClient {
    private readonly sdk;
    constructor(apiKey: string);
    listIssues(updatedSince?: string): Promise<LinearIssue[]>;
    listComments(issueId: string, updatedSince?: string): Promise<LinearComment[]>;
}
//# sourceMappingURL=LinearSdkClient.d.ts.map
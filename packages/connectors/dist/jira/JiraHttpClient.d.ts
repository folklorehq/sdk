import { BaseApiClient } from '../BaseApiClient.js';
import type { JiraApiClient } from './client.js';
import type { JiraComment, JiraIssue, JiraProject } from './types.js';
/** Talks to one Jira Cloud site over REST v3, resolving the site's cloudId from the OAuth token. */
export declare class JiraHttpClient extends BaseApiClient implements JiraApiClient {
    private cloudId;
    constructor(token: string, cloudId?: string);
    listProjects(): Promise<JiraProject[]>;
    listIssues(updatedSince?: string): Promise<JiraIssue[]>;
    listComments(issueKey: string, updatedSince?: string): Promise<JiraComment[]>;
    private searchPath;
    private buildJql;
    private toJqlDate;
    private get;
    private resolveCloudId;
}
//# sourceMappingURL=JiraHttpClient.d.ts.map
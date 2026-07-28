export interface JiraUser {
    accountId: string;
    displayName?: string;
    emailAddress?: string;
}
/** Jira collapses each org's custom statuses into a fixed lifecycle via status categories. */
export type JiraStatusCategoryKey = 'new' | 'indeterminate' | 'done';
export interface JiraStatusCategory {
    key: JiraStatusCategoryKey | string;
    name?: string;
}
export interface JiraStatus {
    name: string;
    statusCategory: JiraStatusCategory;
}
export interface JiraProject {
    id: string;
    key: string;
    name: string;
    isPrivate?: boolean;
}
/** Atlassian Document Format node — rich-text shape for descriptions and comments (REST v3). */
export interface AdfNode {
    type: string;
    text?: string;
    content?: AdfNode[];
    attrs?: Record<string, unknown>;
    marks?: Array<{
        type: string;
        attrs?: Record<string, unknown>;
    }>;
}
export interface JiraIssueFields {
    summary: string;
    description?: AdfNode | null;
    created: string;
    updated: string;
    reporter?: JiraUser | null;
    assignee?: JiraUser | null;
    status: JiraStatus;
    project: JiraProject;
}
export interface JiraIssue {
    id: string;
    key: string;
    fields: JiraIssueFields;
}
export interface JiraComment {
    id: string;
    body?: AdfNode | null;
    author?: JiraUser | null;
    created: string;
    updated?: string;
}
export interface JiraChangelogItem {
    field: string;
    fromString?: string | null;
    toString?: string | null;
}
export interface JiraIssueEvent {
    webhookEvent: 'jira:issue_created' | 'jira:issue_updated';
    issue: JiraIssue;
    changelog?: {
        items: JiraChangelogItem[];
    };
    timestamp?: number;
}
export interface JiraCommentEvent {
    webhookEvent: 'comment_created' | 'comment_updated';
    issue: JiraIssue;
    comment: JiraComment;
    timestamp?: number;
}
//# sourceMappingURL=types.d.ts.map
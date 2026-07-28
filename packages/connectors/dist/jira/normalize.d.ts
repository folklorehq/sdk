import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { JiraCommentEvent, JiraIssue, JiraIssueEvent } from './types.js';
/** The issue key (e.g. PROJ-123) is the stable container id and native thread id. */
export declare function jiraIssueContainerId(issue: JiraIssue): string;
export declare function normalizeJiraIssueEvent(event: JiraIssueEvent): NormalizedRecords;
export declare function normalizeJiraCommentEvent(event: JiraCommentEvent): NormalizedRecords;
export declare function projectToResource(project: {
    key: string;
    isPrivate?: boolean;
}): NormalizedResource;
//# sourceMappingURL=normalize.d.ts.map
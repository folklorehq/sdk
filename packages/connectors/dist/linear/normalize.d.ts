import type { NormalizedRecords } from '../normalized.js';
import type { LinearCommentEvent, LinearIssueEvent, LinearTeam } from './types.js';
export declare function linearIssueContainerId(team: LinearTeam, issueNumber: number): string;
export declare function normalizeLinearIssueEvent(event: LinearIssueEvent): NormalizedRecords;
export declare function normalizeLinearCommentEvent(event: LinearCommentEvent): NormalizedRecords;
//# sourceMappingURL=normalize.d.ts.map
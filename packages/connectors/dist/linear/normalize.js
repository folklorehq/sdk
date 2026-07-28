// SPDX-License-Identifier: Apache-2.0
import { extractExplicitLinks } from '../github/normalize.js';
export function linearIssueContainerId(team, issueNumber) {
    return `${team.key}-${issueNumber}`;
}
function issueAuthors(issue) {
    return issue.assignee ? [{ sourceUserId: issue.assignee.id, role: 'author' }] : [];
}
export function normalizeLinearIssueEvent(event) {
    const issue = event.data;
    const issueId = linearIssueContainerId(issue.team, issue.number);
    if (event.action === 'create') {
        const body = [issue.title, issue.description].filter(Boolean).join('\n\n');
        return {
            containers: [
                {
                    sourceContainerId: issueId,
                    shape: 'stateful',
                    label: 'linear_issue',
                    resourceExternalId: issue.team.id,
                },
            ],
            facts: [
                {
                    sourceFactId: `linear:issue:created:${issue.id}`,
                    kind: 'content',
                    occurredAt: new Date(event.createdAt),
                    resourceExternalId: issue.team.id,
                    authors: issueAuthors(issue),
                    containerRefs: [issueId],
                    sourceThreadId: issueId,
                    entities: [issueId],
                    content: { body, explicitLinks: extractExplicitLinks(body) },
                    raw: event,
                },
            ],
        };
    }
    // update = transition fact
    return {
        containers: [],
        facts: [
            {
                sourceFactId: `linear:issue:updated:${issue.id}:${issue.updatedAt}`,
                kind: 'transition',
                occurredAt: new Date(issue.updatedAt),
                resourceExternalId: issue.team.id,
                authors: issueAuthors(issue),
                containerRefs: [issueId],
                sourceThreadId: issueId,
                entities: [issueId],
                transition: {
                    transitionType: 'updated',
                    detail: { field: 'state', to: issue.state.name },
                },
                raw: event,
            },
        ],
    };
}
export function normalizeLinearCommentEvent(event) {
    const comment = event.data;
    const issueId = linearIssueContainerId(comment.issue.team, comment.issue.number);
    return {
        containers: [],
        facts: [
            {
                sourceFactId: `linear:comment:${comment.id}`,
                kind: 'content',
                occurredAt: new Date(comment.createdAt),
                resourceExternalId: comment.issue.team.id,
                authors: [{ sourceUserId: comment.user.id, role: 'author' }],
                containerRefs: [issueId],
                sourceThreadId: issueId,
                entities: [issueId],
                content: { body: comment.body, explicitLinks: [] },
                raw: event,
            },
        ],
    };
}
//# sourceMappingURL=normalize.js.map
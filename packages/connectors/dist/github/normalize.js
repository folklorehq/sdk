// SPDX-License-Identifier: Apache-2.0
import { FACT_METRIC_KEYS, FACT_METRIC_UNITS } from '@folklore/contracts';
const URL_RE = /https?:\/\/[^\s)]+/g;
const ISSUE_REF_RE = /(?:^|\s)(#\d+)\b/g;
/** Pull URLs and `#123` issue references out of free text (ADL: explicit_links). */
export function extractExplicitLinks(body) {
    const links = new Set();
    for (const match of body.matchAll(URL_RE)) {
        links.add(match[0]);
    }
    for (const match of body.matchAll(ISSUE_REF_RE)) {
        if (match[1])
            links.add(match[1]);
    }
    return [...links];
}
export function pullRequestContainerId(repo, pullNumber) {
    return `${repo.full_name}#${pullNumber}`;
}
function metric(key, value) {
    return { key, value, unit: FACT_METRIC_UNITS[key] };
}
function pullRequestMetrics(input) {
    return [
        metric(FACT_METRIC_KEYS.prAdditions, input.additions),
        metric(FACT_METRIC_KEYS.prDeletions, input.deletions),
        metric(FACT_METRIC_KEYS.prChangedFiles, input.changedFiles),
        metric(FACT_METRIC_KEYS.prCommentCount, input.commentCount),
    ];
}
/** Known-real structured ids for a github fact. `head.ref`/branch names are excluded on purpose (#68). */
function githubEntities(repo, pullNumber) {
    const entities = [repo.full_name];
    if (pullNumber !== undefined)
        entities.push(`PR#${pullNumber}`);
    return entities;
}
export function userToActor(user, role = 'author') {
    return {
        sourceUserId: String(user.id),
        email: user.email ?? undefined,
        displayName: user.name ?? user.login,
        role,
    };
}
export function repoToResource(repo) {
    return { externalId: String(repo.id), resourceType: 'repository', isPublic: !repo.private };
}
/**
 * A PR is a Container (stateful), seeded by a "PR opened" content Fact (ADL #1).
 */
export function normalizePullRequest(repo, pr, metricsInput) {
    const sourceContainerId = pullRequestContainerId(repo, pr.number);
    const resourceExternalId = String(repo.id);
    return {
        container: { sourceContainerId, shape: 'stateful', label: 'github_pr', resourceExternalId },
        fact: {
            sourceFactId: `github:pr_opened:${pr.id}`,
            kind: 'content',
            occurredAt: new Date(pr.created_at),
            resourceExternalId,
            authors: [userToActor(pr.user)],
            containerRefs: [sourceContainerId],
            sourceThreadId: sourceContainerId,
            entities: githubEntities(repo, pr.number),
            content: {
                body: [pr.title, pr.body ?? ''].filter(Boolean).join('\n\n'),
                explicitLinks: extractExplicitLinks(pr.body ?? ''),
            },
            metrics: metricsInput ? pullRequestMetrics(metricsInput) : undefined,
            raw: pr,
        },
    };
}
/** Status changes are their own transition Facts, never a mutated column. */
export function normalizePullRequestTransition(repo, pr, action = pr.state === 'closed' ? 'closed' : 'reopened') {
    const transitionType = action === 'reopened' ? 'reopened' : pr.merged ? 'merged' : 'closed';
    const from = action === 'reopened' ? 'closed' : 'open';
    const to = action === 'reopened' ? 'open' : transitionType;
    const mergeMetrics = pr.merged && pr.closed_at
        ? [
            metric(FACT_METRIC_KEYS.prTimeToMergeSeconds, timeToMergeSeconds(pr.created_at, pr.closed_at)),
        ]
        : undefined;
    return {
        sourceFactId: `github:pr_${transitionType}:${pr.id}:${pr.updated_at}`,
        kind: 'transition',
        occurredAt: new Date(pr.closed_at ?? pr.updated_at),
        resourceExternalId: String(repo.id),
        authors: [userToActor(pr.user)],
        containerRefs: [pullRequestContainerId(repo, pr.number)],
        sourceThreadId: pullRequestContainerId(repo, pr.number),
        entities: githubEntities(repo, pr.number),
        transition: { transitionType, detail: { field: 'state', from, to } },
        metrics: mergeMetrics,
        raw: pr,
    };
}
const MILLIS_PER_SECOND = 1000;
function timeToMergeSeconds(createdAt, closedAt) {
    return Math.round((new Date(closedAt).getTime() - new Date(createdAt).getTime()) / MILLIS_PER_SECOND);
}
export function normalizeIssueComment(repo, pullNumber, comment) {
    return {
        sourceFactId: `github:comment:${comment.id}`,
        kind: 'content',
        occurredAt: new Date(comment.created_at),
        resourceExternalId: String(repo.id),
        authors: [userToActor(comment.user)],
        containerRefs: [pullRequestContainerId(repo, pullNumber)],
        sourceThreadId: pullRequestContainerId(repo, pullNumber),
        entities: githubEntities(repo, pullNumber),
        content: { body: comment.body, explicitLinks: extractExplicitLinks(comment.body) },
        raw: comment,
    };
}
export function normalizeCommit(repo, commit) {
    const author = commit.author ?? commit.committer ?? null;
    const changedFiles = [
        ...(commit.added ?? []),
        ...(commit.modified ?? []),
        ...(commit.removed ?? []),
    ];
    return {
        sourceFactId: `github:commit:${commit.sha}`,
        kind: 'content',
        occurredAt: new Date(commit.timestamp),
        resourceExternalId: String(repo.id),
        authors: author ? [userToActor(author)] : [],
        // Commit↔PR membership is N:M and resolved during ingestion (stacked PRs).
        containerRefs: [],
        entities: [...githubEntities(repo), ...changedFiles],
        content: { body: commit.message, explicitLinks: extractExplicitLinks(commit.message) },
        metrics: [metric(FACT_METRIC_KEYS.commitChangedFiles, changedFiles.length)],
        raw: commit,
    };
}
export function normalizePullRequestEvent(event) {
    const { repository, pull_request, action } = event;
    if (action === 'opened') {
        const { container, fact } = normalizePullRequest(repository, pull_request);
        return { containers: [container], facts: [fact] };
    }
    return {
        containers: [],
        facts: [normalizePullRequestTransition(repository, pull_request, action)],
    };
}
export function normalizeIssueCommentEvent(event) {
    // Only comments on PRs become Facts here, and only on creation.
    if (event.action !== 'created' || !event.issue.pull_request) {
        return { containers: [], facts: [] };
    }
    return {
        containers: [],
        facts: [normalizeIssueComment(event.repository, event.issue.number, event.comment)],
    };
}
export function normalizePushEvent(event) {
    return {
        containers: [],
        facts: event.commits.map((commit) => normalizeCommit(event.repository, commit)),
    };
}
//# sourceMappingURL=normalize.js.map
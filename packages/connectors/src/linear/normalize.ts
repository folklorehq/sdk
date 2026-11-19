// SPDX-License-Identifier: Apache-2.0
import type { NormalizedContainer, NormalizedFact, NormalizedRecords } from '../normalized.js';
import {
  LINEAR_BOT_COMMENT_POLICY,
  type LinearEntityKind,
  cycleBody,
  issueBody,
  issueEntities,
  linearCycleContainer,
  linearCycleContainerId,
  linearFact,
  linearFactKeys,
  linearIssueContainer,
  linearIssueContainerId,
  linearProjectContainer,
  linearProjectContainerId,
  projectBody,
} from './canonical.js';
import { fieldChanges, latestContentEdit, sortHistory } from './history.js';
import type {
  LinearCommentNode,
  LinearCycleNode,
  LinearHistoryNode,
  LinearIssueNode,
  LinearProjectNode,
} from './types.js';

export interface LinearEmitBounds {
  readonly emitAfterMs: number;
  readonly floorMs: number;
}

export const EMPTY: NormalizedRecords = { facts: [], containers: [] };

export function ms(iso: string): number {
  return Date.parse(iso);
}

function inWindow(iso: string, bounds: LinearEmitBounds): boolean {
  return ms(iso) > bounds.emitAfterMs && ms(iso) >= bounds.floorMs;
}

function recordsOf(container: NormalizedContainer, facts: NormalizedFact[]): NormalizedRecords {
  return facts.length === 0 ? EMPTY : { containers: [container], facts };
}

/** One content fact per issue per pull: the latest in-window edit if any, else the creation. */
export function normalizeLinearPulledIssue(
  issue: LinearIssueNode,
  history: readonly LinearHistoryNode[],
  bounds: LinearEmitBounds,
): NormalizedRecords {
  const key = linearIssueContainerId(issue.identifier);
  if (key === null) return EMPTY;
  const inWindowHistory = sortHistory(history).filter((entry) => inWindow(entry.createdAt, bounds));
  const common = {
    entityKind: 'issue',
    entityId: issue.id,
    resourceExternalId: issue.team.id,
    containerRef: key,
    entities: issueEntities(key, issue.project?.id, issue.cycle?.id),
  } as const;
  const facts: NormalizedFact[] = [];

  const edit = latestContentEdit(inWindowHistory);
  if (edit !== null) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.issueEdited(issue.id, edit.id),
        occurredAt: edit.createdAt,
        authorId: edit.actorId,
        body: issueBody(issue.title, issue.description),
        title: issue.title,
      }),
    );
  } else if (inWindow(issue.createdAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.issueCreated(issue.id),
        occurredAt: issue.createdAt,
        authorId: issue.creator?.id ?? null,
        body: issueBody(issue.title, issue.description),
        title: issue.title,
      }),
    );
  }

  for (const entry of inWindowHistory) {
    for (const { field, transition } of fieldChanges(entry)) {
      facts.push(
        linearFact({
          ...common,
          sourceFactId: linearFactKeys.issueField(field, entry.id),
          occurredAt: entry.createdAt,
          authorId: entry.actorId,
          transition,
        }),
      );
    }
  }

  if (issue.archivedAt !== null && inWindow(issue.archivedAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.issueArchived(issue.id, ms(issue.archivedAt)),
        occurredAt: issue.archivedAt,
        authorId: null,
        transition: { transitionType: 'archived' },
      }),
    );
  }

  return recordsOf(linearIssueContainer(key, issue.team.id), facts);
}

export function normalizeLinearPulledComment(
  comment: LinearCommentNode,
  bounds: LinearEmitBounds,
): NormalizedRecords {
  if (comment.issue === null) return EMPTY;
  if (LINEAR_BOT_COMMENT_POLICY === 'drop' && comment.botActor !== null) return EMPTY;
  const key = linearIssueContainerId(comment.issue.identifier);
  if (key === null) return EMPTY;
  const common = {
    entityKind: 'comment',
    entityId: comment.id,
    resourceExternalId: comment.issue.team.id,
    authorId: comment.user?.id ?? null,
    containerRef: key,
    entities: [key],
  } as const;
  const facts: NormalizedFact[] = [];

  if (comment.editedAt !== null && inWindow(comment.editedAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.commentEdited(comment.id, ms(comment.editedAt)),
        occurredAt: comment.editedAt,
        body: comment.body,
      }),
    );
  } else if (inWindow(comment.createdAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.comment(comment.id),
        occurredAt: comment.createdAt,
        body: comment.body,
      }),
    );
  }

  if (comment.resolvedAt !== null && inWindow(comment.resolvedAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.commentResolved(comment.id, ms(comment.resolvedAt)),
        occurredAt: comment.resolvedAt,
        authorId: null,
        transition: { transitionType: 'resolved' },
      }),
    );
  }

  return recordsOf(linearIssueContainer(key, comment.issue.team.id), facts);
}

export function normalizeLinearPulledProject(
  project: LinearProjectNode,
  bounds: LinearEmitBounds,
): NormalizedRecords {
  const key = linearProjectContainerId(project.id);
  const common = {
    entityKind: 'project',
    entityId: project.id,
    containerRef: key,
    entities: [],
  } as const;
  const facts: NormalizedFact[] = [];

  if (inWindow(project.createdAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.projectCreated(project.id),
        occurredAt: project.createdAt,
        authorId: project.creator?.id ?? null,
        body: projectBody(project.name, project.description, project.content),
      }),
    );
  }

  const closedAt = project.completedAt ?? project.canceledAt;
  if (closedAt !== null && inWindow(closedAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.projectClosed(project.id, ms(closedAt)),
        occurredAt: closedAt,
        authorId: null,
        transition: { transitionType: 'closed' },
      }),
    );
  }

  return recordsOf(linearProjectContainer(project.id), facts);
}

export function normalizeLinearPulledCycle(
  cycle: LinearCycleNode,
  bounds: LinearEmitBounds,
): NormalizedRecords {
  const key = linearCycleContainerId(cycle.id);
  const common = {
    entityKind: 'cycle',
    entityId: cycle.id,
    resourceExternalId: cycle.team.id,
    authorId: null,
    containerRef: key,
    entities: [],
  } as const;
  const facts: NormalizedFact[] = [];

  if (inWindow(cycle.createdAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.cycleCreated(cycle.id),
        occurredAt: cycle.createdAt,
        body: cycleBody(cycle.number, cycle.name, cycle.description),
      }),
    );
  }

  if (cycle.completedAt !== null && inWindow(cycle.completedAt, bounds)) {
    facts.push(
      linearFact({
        ...common,
        sourceFactId: linearFactKeys.cycleClosed(cycle.id, ms(cycle.completedAt)),
        occurredAt: cycle.completedAt,
        transition: { transitionType: 'closed' },
      }),
    );
  }

  return recordsOf(linearCycleContainer(cycle.id, cycle.team.id), facts);
}

export interface LinearLifecycleEvent {
  readonly transitionType: 'deleted' | 'restored';
  readonly entityKind: LinearEntityKind;
  readonly entityId: string;
  readonly sourceFactId: string;
  readonly container: NormalizedContainer;
  readonly resourceExternalId?: string;
  readonly occurredAt: string;
}

/** Removals and restores come only from deliveries: the pull sees neither. */
export function normalizeLinearLifecycle(event: LinearLifecycleEvent): NormalizedRecords {
  const containerId = event.container.sourceContainerId;
  const hasIssueContainer = event.entityKind === 'issue' || event.entityKind === 'comment';
  const fact = linearFact({
    sourceFactId: event.sourceFactId,
    entityKind: event.entityKind,
    entityId: event.entityId,
    occurredAt: event.occurredAt,
    ...(event.resourceExternalId === undefined
      ? {}
      : { resourceExternalId: event.resourceExternalId }),
    authorId: null,
    containerRef: containerId,
    entities: hasIssueContainer ? [containerId] : [],
    transition: { transitionType: event.transitionType },
  });
  return { containers: [event.container], facts: [fact] };
}

export function normalizeLinearProjectEdit(project: LinearProjectNode): NormalizedRecords {
  const fact = linearFact({
    sourceFactId: linearFactKeys.projectEdited(project.id, ms(project.updatedAt)),
    entityKind: 'project',
    entityId: project.id,
    occurredAt: project.updatedAt,
    authorId: null,
    containerRef: linearProjectContainerId(project.id),
    entities: [],
    body: projectBody(project.name, project.description, project.content),
  });
  return recordsOf(linearProjectContainer(project.id), [fact]);
}

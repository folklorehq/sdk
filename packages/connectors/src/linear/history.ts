// SPDX-License-Identifier: Apache-2.0
import type { NormalizedTransition } from '../normalized.js';
import type { LinearHistoryNode } from './types.js';

export type LinearIssueField =
  | 'state'
  | 'assignee'
  | 'priority'
  | 'project'
  | 'cycle'
  | 'parent'
  | 'estimate'
  | 'dueDate'
  | 'labels'
  | 'team';

const LINEAR_ISSUE_FIELDS: readonly LinearIssueField[] = [
  'state',
  'assignee',
  'priority',
  'project',
  'cycle',
  'parent',
  'estimate',
  'dueDate',
  'labels',
  'team',
];

export interface LinearFieldChange {
  readonly field: LinearIssueField;
  readonly transition: NormalizedTransition;
}

type Scalar = string | number | null;

interface FieldEndpoints {
  readonly from: Scalar;
  readonly to: Scalar;
}

const STATE_TYPE_TRANSITIONS: Readonly<
  Record<string, 'closed' | 'started' | 'reopened' | 'updated'>
> = {
  completed: 'closed',
  canceled: 'closed',
  started: 'started',
  unstarted: 'reopened',
  backlog: 'reopened',
  triage: 'reopened',
};

function linearStateTransitionType(
  stateType: string | undefined,
): 'closed' | 'started' | 'reopened' | 'updated' {
  return (stateType !== undefined ? STATE_TYPE_TRANSITIONS[stateType] : undefined) ?? 'updated';
}

/** Ascending by time, then id, so equal timestamps order the same on every pull. */
export function sortHistory(history: readonly LinearHistoryNode[]): LinearHistoryNode[] {
  return [...history].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || compareIds(a.id, b.id),
  );
}

function compareIds(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

function isContentEdit(entry: LinearHistoryNode): boolean {
  const titleChanged = entry.fromTitle != null && entry.fromTitle !== entry.toTitle;
  return titleChanged || entry.updatedDescription === true;
}

export function latestContentEdit(history: readonly LinearHistoryNode[]): LinearHistoryNode | null {
  return history.filter(isContentEdit).at(-1) ?? null;
}

export function fieldChanges(entry: LinearHistoryNode): LinearFieldChange[] {
  const changes: LinearFieldChange[] = [];
  for (const field of LINEAR_ISSUE_FIELDS) {
    const transition = fieldTransition(entry, field);
    if (transition !== null) changes.push({ field, transition });
  }
  return changes;
}

function fieldTransition(
  entry: LinearHistoryNode,
  field: LinearIssueField,
): NormalizedTransition | null {
  if (field === 'labels') return labelsTransition(entry);
  const endpoints = scalarEndpoints(entry, field);
  const hasChanged =
    endpoints.from !== endpoints.to && (endpoints.from !== null || endpoints.to !== null);
  if (!hasChanged) return null;
  const transitionType =
    field === 'state' ? linearStateTransitionType(entry.toState?.type) : 'updated';
  return { transitionType, detail: { field, from: endpoints.from, to: endpoints.to } };
}

function labelsTransition(entry: LinearHistoryNode): NormalizedTransition | null {
  const removed = entry.removedLabelIds ?? [];
  const added = entry.addedLabelIds ?? [];
  if (removed.length === 0 && added.length === 0) return null;
  return {
    transitionType: 'updated',
    detail: { field: 'labels', from: [...removed], to: [...added] },
  };
}

function scalarEndpoints(
  entry: LinearHistoryNode,
  field: Exclude<LinearIssueField, 'labels'>,
): FieldEndpoints {
  switch (field) {
    case 'state':
      return { from: entry.fromStateId, to: entry.toStateId };
    case 'assignee':
      return { from: entry.fromAssigneeId, to: entry.toAssigneeId };
    case 'priority':
      return { from: entry.fromPriority, to: entry.toPriority };
    case 'project':
      return { from: entry.fromProjectId, to: entry.toProjectId };
    case 'cycle':
      return { from: entry.fromCycleId, to: entry.toCycleId };
    case 'parent':
      return { from: entry.fromParentId, to: entry.toParentId };
    case 'estimate':
      return { from: entry.fromEstimate, to: entry.toEstimate };
    case 'dueDate':
      return { from: entry.fromDueDate, to: entry.toDueDate };
    case 'team':
      return { from: entry.fromTeamId, to: entry.toTeamId };
  }
}

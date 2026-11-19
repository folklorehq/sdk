// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import type {
  LinearCommentNode,
  LinearCycleNode,
  LinearIssueNode,
  LinearProjectNode,
} from './types.js';

const id = z.string().min(1);
const timestamp = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const text = z.string().nullish();
const optionalTimestamp = timestamp.nullish();

export const linearWebhookEnvelopeSchema = z.object({
  type: z.string(),
  action: z.string(),
  createdAt: timestamp,
  data: z.record(z.unknown()),
  updatedFrom: z.record(z.unknown()).nullish(),
});

export const issueDataSchema = z.object({
  id,
  identifier: z.string(),
  title: z.string(),
  description: text,
  createdAt: timestamp,
  updatedAt: timestamp,
  archivedAt: optionalTimestamp,
  teamId: id,
  creatorId: text,
  projectId: text,
  cycleId: text,
});

export const commentDataSchema = z.object({
  id,
  body: z.string(),
  createdAt: timestamp,
  updatedAt: timestamp,
  editedAt: optionalTimestamp,
  resolvedAt: optionalTimestamp,
  userId: text,
  botActor: z.unknown().nullish(),
  issue: z.object({ id, identifier: z.string(), teamId: id }).nullish(),
});

export const projectDataSchema = z.object({
  id,
  name: z.string(),
  description: z.string(),
  content: text,
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: optionalTimestamp,
  canceledAt: optionalTimestamp,
  archivedAt: optionalTimestamp,
  creatorId: text,
});

export const cycleDataSchema = z.object({
  id,
  number: z.number(),
  name: text,
  description: text,
  createdAt: timestamp,
  updatedAt: timestamp,
  completedAt: optionalTimestamp,
  archivedAt: optionalTimestamp,
  teamId: id,
});

export type IssueData = z.infer<typeof issueDataSchema>;
export type CommentData = z.infer<typeof commentDataSchema>;
export type ProjectData = z.infer<typeof projectDataSchema>;
export type CycleData = z.infer<typeof cycleDataSchema>;

const ref = (value: string | null | undefined) => (value ? { id: value } : null);

export function issueNodeOf(data: IssueData): LinearIssueNode {
  return {
    id: data.id,
    identifier: data.identifier,
    title: data.title,
    description: data.description ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: data.archivedAt ?? null,
    team: { id: data.teamId },
    creator: ref(data.creatorId),
    project: ref(data.projectId),
    cycle: ref(data.cycleId),
    history: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
  };
}

export function commentNodeOf(data: CommentData): LinearCommentNode {
  return {
    id: data.id,
    body: data.body,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    editedAt: data.editedAt ?? null,
    resolvedAt: data.resolvedAt ?? null,
    user: ref(data.userId),
    botActor: data.botActor ? { type: 'bot' } : null,
    issue: data.issue
      ? { id: data.issue.id, identifier: data.issue.identifier, team: { id: data.issue.teamId } }
      : null,
  };
}

export function projectNodeOf(data: ProjectData): LinearProjectNode {
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    content: data.content ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    completedAt: data.completedAt ?? null,
    canceledAt: data.canceledAt ?? null,
    creator: ref(data.creatorId),
  };
}

export function cycleNodeOf(data: CycleData): LinearCycleNode {
  return {
    id: data.id,
    number: data.number,
    name: data.name ?? null,
    description: data.description ?? null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    completedAt: data.completedAt ?? null,
    team: { id: data.teamId },
  };
}

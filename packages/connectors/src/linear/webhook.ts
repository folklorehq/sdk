// SPDX-License-Identifier: Apache-2.0
import type { ZodType, ZodTypeDef } from 'zod';
import type { NormalizedContainer, NormalizedRecords } from '../normalized.js';
import {
  linearCycleContainer,
  linearFactKeys,
  linearIssueContainer,
  linearIssueContainerId,
  linearProjectContainer,
  type LinearEntityKind,
} from './canonical.js';
import {
  EMPTY,
  ms,
  normalizeLinearLifecycle,
  normalizeLinearProjectEdit,
  normalizeLinearPulledComment,
  normalizeLinearPulledCycle,
  normalizeLinearPulledIssue,
  normalizeLinearPulledProject,
  type LinearEmitBounds,
} from './normalize.js';
import {
  type CommentData,
  type CycleData,
  type IssueData,
  type ProjectData,
  commentDataSchema,
  commentNodeOf,
  cycleDataSchema,
  cycleNodeOf,
  issueDataSchema,
  issueNodeOf,
  linearWebhookEnvelopeSchema,
  projectDataSchema,
  projectNodeOf,
} from './webhook-payloads.js';

export type LinearWebhookDropReason =
  | 'unsupported_type'
  | 'unsupported_action'
  | 'unparsed'
  | 'no_previous_update'
  | 'no_container';
export type LinearWebhookEntity = LinearEntityKind | 'other';

export interface LinearWebhookOutcome {
  readonly records: NormalizedRecords;
  readonly dropped: {
    readonly reason: LinearWebhookDropReason;
    readonly entity: LinearWebhookEntity;
  } | null;
}

interface LifecycleTarget {
  readonly container: NormalizedContainer;
  readonly resourceExternalId?: string;
}

interface WebhookEntity {
  readonly kind: LinearEntityKind;
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null | undefined;
  readonly target: LifecycleTarget | null;
  readonly expectsTarget: boolean;
  readonly editFields: readonly string[];
  readonly pulled: (bounds: LinearEmitBounds) => NormalizedRecords;
  readonly edited: () => NormalizedRecords;
}

type LifecycleKey = (id: string, ms: number) => string;

const WEBHOOK_ACTIONS: ReadonlySet<string> = new Set(['create', 'update', 'remove']);
const PROJECT_EDIT_FIELDS = ['name', 'description', 'content'] as const;
const LIFECYCLE_KEYS: Readonly<
  Record<LinearEntityKind, { removed: LifecycleKey; restored: LifecycleKey | null }>
> = {
  issue: { removed: linearFactKeys.issueRemoved, restored: linearFactKeys.issueRestored },
  comment: { removed: linearFactKeys.commentRemoved, restored: null },
  project: { removed: linearFactKeys.projectRemoved, restored: linearFactKeys.projectRestored },
  cycle: { removed: linearFactKeys.cycleRemoved, restored: linearFactKeys.cycleRestored },
};

const ENTITY_TYPES: ReadonlyMap<
  string,
  { readonly kind: LinearEntityKind; readonly parse: (data: unknown) => WebhookEntity | null }
> = new Map([
  ['Issue', { kind: 'issue', parse: entityParser(issueDataSchema, issueEntity) }],
  ['Comment', { kind: 'comment', parse: entityParser(commentDataSchema, commentEntity) }],
  ['Project', { kind: 'project', parse: entityParser(projectDataSchema, projectEntity) }],
  ['Cycle', { kind: 'cycle', parse: entityParser(cycleDataSchema, cycleEntity) }],
]);

function entityParser<TData>(
  schema: ZodType<TData, ZodTypeDef, unknown>,
  build: (data: TData) => WebhookEntity,
): (data: unknown) => WebhookEntity | null {
  return (data) => {
    const parsed = schema.safeParse(data);
    return parsed.success ? build(parsed.data) : null;
  };
}

function issueEntity(data: IssueData): WebhookEntity {
  const node = issueNodeOf(data);
  const key = linearIssueContainerId(data.identifier);
  return {
    kind: 'issue',
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: data.archivedAt,
    target:
      key === null
        ? null
        : { container: linearIssueContainer(key, data.teamId), resourceExternalId: data.teamId },
    expectsTarget: true,
    editFields: [],
    pulled: (bounds) => normalizeLinearPulledIssue(node, node.history.nodes, bounds),
    edited: () => EMPTY,
  };
}

function commentEntity(data: CommentData): WebhookEntity {
  const node = commentNodeOf(data);
  const key = data.issue ? linearIssueContainerId(data.issue.identifier) : null;
  return {
    kind: 'comment',
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: undefined,
    target:
      data.issue && key !== null
        ? {
            container: linearIssueContainer(key, data.issue.teamId),
            resourceExternalId: data.issue.teamId,
          }
        : null,
    expectsTarget: Boolean(data.issue),
    editFields: [],
    pulled: (bounds) => normalizeLinearPulledComment(node, bounds),
    edited: () => EMPTY,
  };
}

function projectEntity(data: ProjectData): WebhookEntity {
  const node = projectNodeOf(data);
  return {
    kind: 'project',
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: data.archivedAt,
    target: { container: linearProjectContainer(data.id) },
    expectsTarget: true,
    editFields: PROJECT_EDIT_FIELDS,
    pulled: (bounds) => normalizeLinearPulledProject(node, bounds),
    edited: () => normalizeLinearProjectEdit(node),
  };
}

function cycleEntity(data: CycleData): WebhookEntity {
  const node = cycleNodeOf(data);
  return {
    kind: 'cycle',
    id: data.id,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    archivedAt: data.archivedAt,
    target: {
      container: linearCycleContainer(data.id, data.teamId),
      resourceExternalId: data.teamId,
    },
    expectsTarget: true,
    editFields: [],
    pulled: (bounds) => normalizeLinearPulledCycle(node, bounds),
    edited: () => EMPTY,
  };
}

function mergeRecords(parts: readonly NormalizedRecords[]): NormalizedRecords {
  const containers = new Map<string, NormalizedContainer>();
  for (const part of parts) {
    for (const container of part.containers) containers.set(container.sourceContainerId, container);
  }
  return { containers: [...containers.values()], facts: parts.flatMap((part) => part.facts) };
}

function dropped(
  reason: LinearWebhookDropReason,
  entity: LinearWebhookEntity,
): LinearWebhookOutcome {
  return { records: EMPTY, dropped: { reason, entity } };
}

function lifecycleRecords(
  entity: WebhookEntity,
  target: LifecycleTarget,
  transitionType: 'deleted' | 'restored',
  sourceFactId: string,
  occurredAt: string,
): NormalizedRecords {
  return normalizeLinearLifecycle({
    transitionType,
    entityKind: entity.kind,
    entityId: entity.id,
    sourceFactId,
    container: target.container,
    ...(target.resourceExternalId === undefined
      ? {}
      : { resourceExternalId: target.resourceExternalId }),
    occurredAt,
  });
}

function previousUpdateMs(updatedFrom: Record<string, unknown> | null | undefined): number | null {
  const previous = updatedFrom?.['updatedAt'];
  if (typeof previous !== 'string') return null;
  const parsed = ms(previous);
  return Number.isNaN(parsed) ? null : parsed;
}

function restoredRecords(
  entity: WebhookEntity,
  target: LifecycleTarget,
  updatedFrom: Record<string, unknown> | null | undefined,
): NormalizedRecords {
  const key = LIFECYCLE_KEYS[entity.kind].restored;
  const wasArchived = typeof updatedFrom?.['archivedAt'] === 'string';
  if (key === null || !wasArchived || typeof entity.archivedAt === 'string') return EMPTY;
  return lifecycleRecords(
    entity,
    target,
    'restored',
    key(entity.id, ms(entity.updatedAt)),
    entity.updatedAt,
  );
}

function updateRecords(
  entity: WebhookEntity,
  target: LifecycleTarget,
  updatedFrom: Record<string, unknown> | null | undefined,
  previousMs: number,
): NormalizedRecords {
  const previous = updatedFrom ?? {};
  const isEdited = entity.editFields.some((field) => field in previous);
  return mergeRecords([
    entity.pulled({ emitAfterMs: previousMs, floorMs: 0 }),
    restoredRecords(entity, target, updatedFrom),
    isEdited ? entity.edited() : EMPTY,
  ]);
}

/** Turns one Linear delivery into the facts the pull would produce for the same item, plus removals, restores and project edits. */
export function normalizeLinearWebhook(payload: unknown): LinearWebhookOutcome {
  const envelope = linearWebhookEnvelopeSchema.safeParse(payload);
  if (!envelope.success) return dropped('unparsed', 'other');
  const { type, action, createdAt, data, updatedFrom } = envelope.data;
  const entityType = ENTITY_TYPES.get(type);
  if (entityType === undefined) return dropped('unsupported_type', 'other');
  const { kind, parse } = entityType;
  if (!WEBHOOK_ACTIONS.has(action)) return dropped('unsupported_action', kind);
  const entity = parse(data);
  if (entity === null) return dropped('unparsed', kind);
  const target = entity.target;

  if (target === null) {
    return action === 'remove' || entity.expectsTarget
      ? dropped('no_container', kind)
      : { records: EMPTY, dropped: null };
  }
  if (action === 'remove') {
    const sourceFactId = LIFECYCLE_KEYS[kind].removed(entity.id, ms(createdAt));
    return {
      records: lifecycleRecords(entity, target, 'deleted', sourceFactId, createdAt),
      dropped: null,
    };
  }
  if (action === 'create') {
    const createdMs = ms(entity.createdAt);
    const bounds = { emitAfterMs: createdMs - 1, floorMs: createdMs };
    return { records: entity.pulled(bounds), dropped: null };
  }
  const previousMs = previousUpdateMs(updatedFrom);
  if (previousMs === null) return dropped('no_previous_update', kind);
  return { records: updateRecords(entity, target, updatedFrom, previousMs), dropped: null };
}

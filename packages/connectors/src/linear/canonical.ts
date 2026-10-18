// SPDX-License-Identifier: Apache-2.0
import {
  canonicalLinkKeys,
  extractExplicitLinks,
  isIssueKey,
  issueKey,
  issueKeyPrefix,
} from '@folklore/utils';
import type { NormalizedFact, NormalizedTransition } from '../normalized.js';
import type { LinearIssueField } from './history.js';

export type LinearEntityKind = 'issue' | 'comment' | 'project' | 'cycle';

interface LinearFactBase {
  readonly sourceFactId: string;
  readonly entityKind: LinearEntityKind;
  readonly entityId: string;
  readonly occurredAt: string;
  readonly resourceExternalId?: string;
  readonly authorId: string | null;
  readonly containerRef: string;
  readonly entities: readonly string[];
}

export type LinearFactInput = LinearFactBase &
  (
    | { readonly body: string; readonly transition?: undefined }
    | { readonly transition: NormalizedTransition; readonly body?: undefined }
  );

export const LINEAR_BOT_COMMENT_POLICY: 'keep' | 'drop' = 'keep';

export const linearFactKeys = {
  issueCreated: (id: string) => `linear:issue:created:${id}`,
  issueField: (field: LinearIssueField, historyId: string) => `linear:issue:${field}:${historyId}`,
  issueEdited: (id: string, historyId: string) => `linear:issue:edited:${id}:${historyId}`,
  issueArchived: (id: string, ms: number) => `linear:issue:archived:${id}:${ms}`,
  comment: (id: string) => `linear:comment:${id}`,
  commentEdited: (id: string, ms: number) => `linear:comment:edited:${id}:${ms}`,
  commentResolved: (id: string, ms: number) => `linear:comment:resolved:${id}:${ms}`,
  projectCreated: (id: string) => `linear:project:created:${id}`,
  projectClosed: (id: string, ms: number) => `linear:project:closed:${id}:${ms}`,
  cycleCreated: (id: string) => `linear:cycle:created:${id}`,
  cycleClosed: (id: string, ms: number) => `linear:cycle:closed:${id}:${ms}`,
} as const;

export function linearIssueContainerId(identifier: string): string | null {
  if (!isIssueKey(identifier)) return null;
  const prefix = issueKeyPrefix(identifier);
  return issueKey(prefix, identifier.slice(prefix.length + 1));
}

export const linearProjectContainerId = (id: string): string => `linear:project:${id}`;

export const linearCycleContainerId = (id: string): string => `linear:cycle:${id}`;

export function issueBody(title: string, description: string | null | undefined): string {
  return [title, description].filter(Boolean).join('\n\n');
}

export function projectBody(
  name: string,
  description: string,
  content: string | null | undefined,
): string {
  return [name, description, content].filter(Boolean).join('\n\n');
}

export function cycleBody(
  number: number,
  name: string | null | undefined,
  description: string | null | undefined,
): string {
  return [name ?? `Cycle ${number}`, description].filter(Boolean).join('\n\n');
}

export function issueEntities(
  key: string,
  projectId: string | null | undefined,
  cycleId: string | null | undefined,
): string[] {
  const entities = [key];
  if (projectId) entities.push(linearProjectContainerId(projectId));
  if (cycleId) entities.push(linearCycleContainerId(cycleId));
  return entities;
}

/** Every Linear fact is built here so a logical event serialises to the same bytes on every path. */
export function linearFact(input: LinearFactInput): NormalizedFact {
  return {
    sourceFactId: input.sourceFactId,
    kind: input.body !== undefined ? 'content' : 'transition',
    occurredAt: new Date(input.occurredAt),
    ...(input.resourceExternalId === undefined
      ? {}
      : { resourceExternalId: input.resourceExternalId }),
    authors: input.authorId ? [{ sourceUserId: input.authorId, role: 'author' }] : [],
    containerRefs: [input.containerRef],
    sourceThreadId: input.containerRef,
    entities: [...input.entities],
    ...(input.body !== undefined
      ? {
          content: {
            body: input.body,
            explicitLinks: canonicalLinkKeys(extractExplicitLinks(input.body)),
          },
        }
      : { transition: input.transition }),
    raw: { entity: input.entityKind, id: input.entityId },
  };
}

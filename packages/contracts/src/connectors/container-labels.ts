// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import type { ConnectorManifest } from './manifest.js';
import { PRIVATE_CONNECTOR_MANIFESTS } from './private-registry.js';
import { PUBLIC_CONNECTOR_MANIFESTS } from './public-registry.js';

// Our own literals, never customer text — the label lookup they key is shared, not per-tenant.
export const BUILTIN_CONTAINER_LABELS = [
  'calendar_event',
  'code_repo',
  'confluence_page',
  'email_thread',
  'github_pr',
  'github_repo',
  'google_doc',
  'intercom_conversation',
  'jira_issue',
  'linear_cycle',
  'linear_issue',
  'linear_project',
  'meeting_transcript',
  'microsoft365_doc',
  'notion_page',
  'slack_channel',
  'slack_thread',
  'unknown',
] as const;

type RegisteredManifest =
  | (typeof PUBLIC_CONNECTOR_MANIFESTS)[number]
  | (typeof PRIVATE_CONNECTOR_MANIFESTS)[number];
type DeclaredLabel = Extract<
  RegisteredManifest,
  { readonly containerLabels: readonly string[] }
>['containerLabels'][number];

export type ContainerLabel = (typeof BUILTIN_CONTAINER_LABELS)[number] | DeclaredLabel;

// Conflicts are reported by containerLabelViolations in the manifest invariants, not thrown at load.
export function declaredContainerLabels(manifests: readonly ConnectorManifest[]): string[] {
  const builtin = new Set<string>(BUILTIN_CONTAINER_LABELS);
  const declared = manifests.flatMap((manifest) => manifest.containerLabels ?? []);
  return [...new Set(declared)].filter((label) => !builtin.has(label));
}

export function buildContainerLabelSchema(manifests: readonly ConnectorManifest[]) {
  const labels = [...BUILTIN_CONTAINER_LABELS, ...declaredContainerLabels(manifests)];
  return z.enum(labels as [string, ...string[]]);
}

export const containerLabelSchema = buildContainerLabelSchema([
  ...PUBLIC_CONNECTOR_MANIFESTS,
  ...PRIVATE_CONNECTOR_MANIFESTS,
]) as unknown as z.ZodEnum<[ContainerLabel, ...ContainerLabel[]]>;

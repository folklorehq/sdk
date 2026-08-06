// SPDX-License-Identifier: Apache-2.0
// Source-agnostic records a connector emits. The ingestion layer (separate)
// consumes these and persists them as rows in @folklore/tenant-db — connectors never
// touch the database themselves.

import type { ContainerLabel } from '@folklore/contracts';

/** Mirrors the `container_shape` enum in @folklore/tenant-db (keep in sync). */
export type ContainerShape = 'flat' | 'stateful' | 'hierarchical' | 'event';

/** Mirrors the `fact_kind` enum in @folklore/tenant-db. */
export type NormalizedFactKind = 'content' | 'transition';

export interface NormalizedActor {
  sourceUserId: string;
  email?: string;
  displayName?: string;
  role?: 'author' | 'co_author';
}

/** A unit access is checked against (channel, repository, project, ...). */
export interface NormalizedResource {
  externalId: string;
  resourceType: string;
  isPublic: boolean;
  parentExternalId?: string;
}

export interface NormalizedContent {
  body: string;
  explicitLinks: string[];
}

/** Content-free numeric upstream signal — only scalars; never a path/filename/label. */
export interface NormalizedMetric {
  key: string;
  value: number;
  unit: string;
}

export interface NormalizedTransition {
  /** closed | merged | reopened | derived_from | ... */
  transitionType: string;
  detail?: { field?: string; from?: unknown; to?: unknown };
}

/** One indivisible Fact: `content`/`transition` are mutually exclusive per `kind`; `raw` is the original payload kept only for the short rolling buffer. */
export interface NormalizedFact {
  sourceFactId: string;
  kind: NormalizedFactKind;
  occurredAt: Date;
  /** `external_id` of the source resource this Fact belongs to. */
  resourceExternalId?: string;
  authors: NormalizedActor[];
  /** `sourceContainerId`s this Fact belongs to (N:M — e.g. stacked PRs). */
  containerRefs: string[];
  /** Platform-native thread identifier for deterministic association scoring. */
  sourceThreadId?: string;
  /** High-confidence, content-free structured ids the source guarantees (repo full_name, issue/PR/Jira keys). Branch names are deliberately excluded — a developer-chosen branch codename must never surface as an entity (#68). */
  entities?: string[];
  content?: NormalizedContent;
  transition?: NormalizedTransition;
  /** Content-free numeric attributes of the source event — never a path or label. */
  metrics?: NormalizedMetric[];
  raw: unknown;
}

/** A grouping of Facts with a lifecycle/label. */
export interface NormalizedContainer {
  sourceContainerId: string;
  shape: ContainerShape;
  label: ContainerLabel;
  resourceExternalId?: string;
}

/** A connector's output for one pull batch or webhook. */
export interface NormalizedRecords {
  facts: NormalizedFact[];
  containers: NormalizedContainer[];
}

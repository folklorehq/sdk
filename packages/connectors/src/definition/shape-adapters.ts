// SPDX-License-Identifier: Apache-2.0
import type { ContainerLabel, FactMapping, FactOutcomeCode } from '@folklore/contracts';
import type { NormalizedRecords } from '../normalized.js';

// Kept off NormalizedRecords so a connector that spreads its records into a pull result cannot carry per-record codes into the per-stream totals.
export interface ShapeRecords extends NormalizedRecords {
  readonly outcomes?: readonly FactOutcomeCode[];
  // Set by a shape that refused the record: its cursor value and child streams are skipped.
  readonly rejected?: true;
}

export interface ShapeContext {
  readonly kind: string;
  readonly since: string | undefined;
  readonly parentContainerLabel: ContainerLabel | null;
  readonly parentMapping?: FactMapping | null;
  readonly streamName: string;
  readonly parentStreamName: string | null;
  readonly now: () => Date;
  readonly secrets: readonly string[];
}

export interface ShapeAdapter {
  toRecords(
    record: unknown,
    mapping: FactMapping,
    ctx: ShapeContext,
    parent: unknown,
  ): ShapeRecords;
}

export type ShapeAdapterKey = 'item' | 'comment' | 'fact' | 'calendar_event:gcal';
export type ShapeAdapters = Readonly<Partial<Record<ShapeAdapterKey, ShapeAdapter>>>;

export function shapeAdapterKey(mapping: FactMapping): ShapeAdapterKey {
  return mapping.shape === 'calendar_event' ? `calendar_event:${mapping.namespace}` : mapping.shape;
}

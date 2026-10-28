// SPDX-License-Identifier: Apache-2.0
import type { ContainerLabel, FactMapping } from '@folklore/contracts';
import type { NormalizedRecords } from '../normalized.js';

export interface ShapeContext {
  readonly kind: string;
  readonly since: string | undefined;
  readonly parentContainerLabel: ContainerLabel | null;
  readonly now: () => Date;
}

export interface ShapeAdapter {
  toRecords(
    record: unknown,
    mapping: FactMapping,
    ctx: ShapeContext,
    parent: unknown,
  ): NormalizedRecords;
}

export type ShapeAdapterKey = 'item' | 'comment' | 'calendar_event:gcal';
export type ShapeAdapters = Readonly<Partial<Record<ShapeAdapterKey, ShapeAdapter>>>;

export function shapeAdapterKey(mapping: FactMapping): ShapeAdapterKey {
  return mapping.shape === 'calendar_event' ? `calendar_event:${mapping.namespace}` : mapping.shape;
}

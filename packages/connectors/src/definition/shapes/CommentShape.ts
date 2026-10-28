// SPDX-License-Identifier: Apache-2.0
import type { FactMapping } from '@folklore/contracts';
import { extractExplicitLinks, resolveJsonPointer } from '@folklore/utils';
import type { NormalizedRecords } from '../../normalized.js';
import type { ShapeAdapter, ShapeContext } from '../shape-adapters.js';
import { firstValidTime } from './record-time.js';
import { authorsAt, scalarAt, textAt } from './record-values.js';
import { sensitivityHintsFor } from './sensitivity.js';

const EMPTY: NormalizedRecords = { containers: [], facts: [] };

// UNWIRED: no shipped spec emits this shape until the first new declarative kind.
export class CommentShape implements ShapeAdapter {
  toRecords(
    record: unknown,
    mapping: FactMapping,
    ctx: ShapeContext,
    parent: unknown,
  ): NormalizedRecords {
    if (mapping.shape !== 'comment' || ctx.parentContainerLabel === null) return EMPTY;
    const id = scalarAt(record, mapping.idPointer);
    const parentId = scalarAt(parent, mapping.parentIdPointer);
    if (id === undefined || parentId === undefined) return EMPTY;
    const parentContainerId = `${ctx.kind}:${ctx.parentContainerLabel}:${parentId}`;
    const body = textAt(record, mapping.bodyPointer);
    return {
      containers: [],
      facts: [
        {
          sourceFactId: `${ctx.kind}:comment:${id}`,
          kind: 'content',
          occurredAt: firstValidTime(ctx.now, resolveJsonPointer(record, mapping.createdAtPointer)),
          authors: authorsAt(record, mapping.authorIdPointer),
          containerRefs: [parentContainerId],
          sourceThreadId: parentContainerId,
          content: { body, explicitLinks: extractExplicitLinks(body) },
          sensitivityHints: sensitivityHintsFor(mapping.sensitivity, parent),
          raw: record,
        },
      ],
    };
  }
}

// SPDX-License-Identifier: Apache-2.0
import type { ContainerLabel, FactMapping } from '@folklore/contracts';
import { extractExplicitLinks, resolveJsonPointer } from '@folklore/utils';
import type {
  NormalizedActor,
  NormalizedContainer,
  NormalizedContent,
  NormalizedFact,
  NormalizedRecords,
  SensitivityHints,
} from '../../normalized.js';
import type { ShapeAdapter, ShapeContext } from '../shape-adapters.js';
import { firstValidTime } from './record-time.js';
import { authorsAt, scalarAt, textAt } from './record-values.js';
import { sensitivityHintsFor } from './sensitivity.js';

type ItemMapping = Extract<FactMapping, { shape: 'item' }>;

const EMPTY: NormalizedRecords = { containers: [], facts: [] };
const TITLE_BODY_SEPARATOR = '\n\n';

interface ItemView {
  readonly record: unknown;
  readonly mapping: ItemMapping;
  readonly ctx: ShapeContext;
  readonly label: ContainerLabel;
  readonly id: string;
  readonly containerId: string;
  readonly createdText: string | undefined;
  readonly updatedText: string | undefined;
  readonly createdValue: unknown;
  readonly updatedValue: unknown;
  readonly authors: NormalizedActor[];
  readonly content: NormalizedContent;
  readonly hints: SensitivityHints;
}

// UNWIRED: no shipped spec emits this shape until the first new declarative kind.
export class ItemShape implements ShapeAdapter {
  toRecords(record: unknown, mapping: FactMapping, ctx: ShapeContext): NormalizedRecords {
    if (mapping.shape !== 'item') return EMPTY;
    const id = scalarAt(record, mapping.idPointer);
    if (id === undefined) return EMPTY;
    const view = this.view(record, mapping, ctx, id);
    return { containers: [this.container(view)], facts: this.facts(view) };
  }

  private view(record: unknown, mapping: ItemMapping, ctx: ShapeContext, id: string): ItemView {
    const label = mapping.containerLabel;
    const body = this.body(record, mapping);
    return {
      record,
      mapping,
      ctx,
      label,
      id,
      containerId: `${ctx.kind}:${label}:${id}`,
      createdText: scalarAt(record, mapping.createdAtPointer),
      updatedText: scalarAt(record, mapping.updatedAtPointer),
      createdValue: resolveJsonPointer(record, mapping.createdAtPointer),
      updatedValue: resolveJsonPointer(record, mapping.updatedAtPointer),
      authors: authorsAt(record, mapping.authorIdPointer),
      content: { body, explicitLinks: extractExplicitLinks(body) },
      hints: sensitivityHintsFor(mapping.sensitivity, record),
    };
  }

  private body(record: unknown, mapping: ItemMapping): string {
    const title = textAt(record, mapping.titlePointer);
    const text = mapping.bodyPointer === null ? '' : textAt(record, mapping.bodyPointer);
    return text === '' ? title : `${title}${TITLE_BODY_SEPARATOR}${text}`;
  }

  private container(view: ItemView): NormalizedContainer {
    return {
      sourceContainerId: view.containerId,
      shape: view.mapping.status ? 'stateful' : 'flat',
      label: view.label,
    };
  }

  private facts(view: ItemView): NormalizedFact[] {
    const facts = [this.contentFact(view, 'created')];
    if (view.updatedText !== undefined && view.updatedText !== view.createdText) {
      facts.push(this.contentFact(view, 'edited'));
    }
    const transition = this.transitionFact(view);
    return transition ? [...facts, transition] : facts;
  }

  private contentFact(view: ItemView, kind: 'created' | 'edited'): NormalizedFact {
    const prefix = `${view.ctx.kind}:${view.label}`;
    const edited = kind === 'edited';
    return {
      sourceFactId: edited
        ? `${prefix}:edited:${view.id}:${view.updatedText}`
        : `${prefix}:created:${view.id}`,
      kind: 'content',
      occurredAt: this.occurredAt(view, edited),
      authors: view.authors,
      containerRefs: [view.containerId],
      sourceThreadId: view.containerId,
      content: view.content,
      sensitivityHints: view.hints,
      raw: view.record,
    };
  }

  private transitionFact(view: ItemView): NormalizedFact | null {
    const status = view.mapping.status;
    if (status === null) return null;
    const value = scalarAt(view.record, status.pointer);
    const transitionType =
      value !== undefined && Object.hasOwn(status.map, value) ? status.map[value] : undefined;
    if (value === undefined || transitionType === undefined) return null;
    const revision = view.updatedText ?? view.createdText ?? '';
    return {
      sourceFactId: `${view.ctx.kind}:${view.label}:status:${view.id}:${revision}`,
      kind: 'transition',
      occurredAt: this.occurredAt(view, true),
      authors: view.authors,
      containerRefs: [view.containerId],
      sourceThreadId: view.containerId,
      transition: {
        transitionType,
        detail: { field: 'status', to: value },
      },
      sensitivityHints: view.hints,
      raw: view.record,
    };
  }

  private occurredAt(view: ItemView, preferUpdated: boolean): Date {
    const ordered = preferUpdated
      ? [view.updatedValue, view.createdValue]
      : [view.createdValue, view.updatedValue];
    return firstValidTime(view.ctx.now, ...ordered);
  }
}

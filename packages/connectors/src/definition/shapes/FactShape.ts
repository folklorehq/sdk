// SPDX-License-Identifier: Apache-2.0
import type { ContainerLabel, FactDefinition, FactMapping } from '@folklore/contracts';
import { extractExplicitLinks } from '@folklore/utils';
import type {
  NormalizedActor,
  NormalizedContainer,
  NormalizedContent,
  NormalizedFact,
  NormalizedRecords,
  SensitivityHints,
} from '../../normalized.js';
import type { ShapeAdapter, ShapeContext, ShapeRecords } from '../shape-adapters.js';
import { FactProjector, scalarText, timestampOf, type FactScalar } from './FactProjector.js';

const EMPTY: NormalizedRecords = { containers: [], facts: [] };
const PART_SEPARATOR = '\n\n';
const ATTRIBUTE_OPEN = '[fields]';
const ATTRIBUTE_CLOSE = '[/fields]';
const FORMAT_GAP = '\\p{Cf}*';
const REGEX_SPECIAL = /[[\]]/;
const FENCE_TOKEN = new RegExp(
  [ATTRIBUTE_OPEN, ATTRIBUTE_CLOSE]
    .map((token) =>
      [...token].map((char) => (REGEX_SPECIAL.test(char) ? `\\${char}` : char)).join(FORMAT_GAP),
    )
    .join('|'),
  'giu',
);

type Values = ReadonlyMap<string, FactScalar>;

interface ItemView {
  readonly mapping: FactDefinition;
  readonly ctx: ShapeContext;
  readonly label: ContainerLabel;
  readonly id: string;
  readonly stream: string;
  readonly containerId: string;
  readonly createdText: string | undefined;
  readonly updatedText: string | undefined;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
  readonly authors: NormalizedActor[];
  readonly content: NormalizedContent;
  readonly hints: SensitivityHints;
  readonly values: Values;
  readonly raw: Record<string, FactScalar>;
}

// UNWIRED: no shipped definition emits this shape until a custom connector is wired.
export class FactShape implements ShapeAdapter {
  toRecords(
    record: unknown,
    mapping: FactMapping,
    ctx: ShapeContext,
    parent?: unknown,
  ): ShapeRecords {
    if (mapping.shape !== 'fact') return EMPTY;
    const projection = new FactProjector(ctx.now, ctx.secrets).project(record, mapping);
    if (!projection.ok) return { ...EMPTY, outcomes: [projection.reason], rejected: true };
    const records =
      mapping.role === 'item'
        ? this.item(projection.values, mapping, ctx)
        : this.comment(projection.values, mapping, ctx, parent);
    return records === null
      ? { ...EMPTY, outcomes: projection.outcomes, rejected: true }
      : { ...records, outcomes: projection.outcomes };
  }

  private item(
    values: Values,
    mapping: FactDefinition,
    ctx: ShapeContext,
  ): NormalizedRecords | null {
    const view = this.view(values, mapping, ctx);
    return view === null ? null : { containers: [this.container(view)], facts: this.facts(view) };
  }

  private view(values: Values, mapping: FactDefinition, ctx: ShapeContext): ItemView | null {
    const label = mapping.containerLabel;
    const id = this.text(values, mapping.id.pointer);
    const stream = ctx.streamName;
    if (label === null || id === undefined || stream === undefined) return null;
    const createdText = this.text(values, mapping.createdAt.pointer);
    const updatedText = this.optionalText(values, mapping.updatedAt?.pointer);
    return {
      mapping,
      ctx,
      label,
      id,
      stream,
      containerId: `${ctx.kind}:${label}:${stream}:${id}`,
      createdText,
      updatedText,
      createdAt: this.time(values, mapping.createdAt.pointer),
      updatedAt: this.time(values, mapping.updatedAt?.pointer),
      authors: this.authors(values, mapping),
      content: this.content(values, mapping),
      hints: this.hints(values, mapping),
      values,
      raw: Object.fromEntries(values),
    };
  }

  private comment(
    values: Values,
    mapping: FactDefinition,
    ctx: ShapeContext,
    parent: unknown,
  ): NormalizedRecords | null {
    const id = this.text(values, mapping.id.pointer);
    const parentId = this.parentId(values, mapping, ctx, parent);
    const { streamName, parentStreamName, parentContainerLabel } = ctx;
    if (
      parentContainerLabel === null ||
      !streamName ||
      !parentStreamName ||
      id === undefined ||
      parentId === undefined
    ) {
      return null;
    }
    const parentContainerId = `${ctx.kind}:${parentContainerLabel}:${parentStreamName}:${parentId}`;
    const created = this.time(values, mapping.createdAt.pointer);
    return {
      containers: [],
      facts: [
        {
          sourceFactId: `${ctx.kind}:comment:${streamName}:${id}`,
          kind: 'content',
          occurredAt: created ?? ctx.now(),
          authors: this.authors(values, mapping),
          containerRefs: [parentContainerId],
          sourceThreadId: parentContainerId,
          content: this.content(values, mapping),
          sensitivityHints: this.hints(values, mapping),
          raw: Object.fromEntries(values),
        },
      ],
    };
  }

  private parentId(
    values: Values,
    mapping: FactDefinition,
    ctx: ShapeContext,
    parent: unknown,
  ): string | undefined {
    if (mapping.parentId !== null) return this.text(values, mapping.parentId.pointer);
    const parentMapping = ctx.parentMapping;
    if (parentMapping?.shape !== 'fact') return undefined;
    const id = new FactProjector(ctx.now, ctx.secrets).identity(parent, parentMapping);
    return id === undefined ? undefined : scalarText(id);
  }

  private text(values: Values, pointer: string): string | undefined {
    const value = values.get(pointer);
    return value === undefined ? undefined : scalarText(value);
  }

  private optionalText(values: Values, pointer: string | undefined): string | undefined {
    return pointer === undefined ? undefined : this.text(values, pointer);
  }

  private time(values: Values, pointer: string | undefined): Date | null {
    const value = pointer === undefined ? undefined : values.get(pointer);
    return value === undefined ? null : timestampOf(value);
  }

  private authors(values: Values, mapping: FactDefinition): NormalizedActor[] {
    const sourceUserId =
      mapping.author === null ? undefined : this.text(values, mapping.author.pointer);
    return sourceUserId === undefined ? [] : [{ sourceUserId, role: 'author' }];
  }

  private content(values: Values, mapping: FactDefinition): NormalizedContent {
    const title = mapping.title === null ? undefined : values.get(mapping.title.pointer);
    const body = mapping.body === null ? undefined : values.get(mapping.body.pointer);
    const parts = [
      title === undefined ? '' : this.withoutFence(scalarText(title)),
      this.attributeBlock(values, mapping),
      body === undefined ? '' : this.withoutFence(scalarText(body)),
    ].filter((part) => part !== '');
    const text = parts.join(PART_SEPARATOR);
    return { body: text, explicitLinks: extractExplicitLinks(text) };
  }

  private attributeBlock(values: Values, mapping: FactDefinition): string {
    const lines = mapping.attributes.flatMap((attribute) => {
      const value = values.get(attribute.field.pointer);
      const text = value === undefined ? '' : this.withoutFence(scalarText(value));
      return text === '' ? [] : [`${attribute.label}: ${text}`];
    });
    return lines.length === 0 ? '' : [ATTRIBUTE_OPEN, ...lines, ATTRIBUTE_CLOSE].join('\n');
  }

  // A value must never close or reopen the fence, so tokens are removed until none can reform.
  private withoutFence(value: string): string {
    let current = value;
    for (let previous = ''; previous !== current; ) {
      previous = current;
      current = current.replace(FENCE_TOKEN, '');
    }
    return current;
  }

  private hints(values: Values, mapping: FactDefinition): SensitivityHints {
    const { sensitivity } = mapping;
    const names = sensitivity.names.flatMap((field) => {
      const value = values.get(field.pointer);
      return typeof value === 'string' ? [value] : [];
    });
    const restricted =
      sensitivity.mode === 'always' ||
      !sensitivity.publicValues.some(
        (publicValue) => publicValue === values.get(sensitivity.field.pointer),
      );
    return { names: [...new Set(names)], restrictedScope: restricted };
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
        ? `${prefix}:edited:${view.stream}:${view.id}:${view.updatedText}`
        : `${prefix}:created:${view.stream}:${view.id}`,
      kind: 'content',
      occurredAt: this.occurredAt(view, edited),
      authors: view.authors,
      containerRefs: [view.containerId],
      sourceThreadId: view.containerId,
      content: view.content,
      sensitivityHints: view.hints,
      raw: view.raw,
    };
  }

  private transitionFact(view: ItemView): NormalizedFact | null {
    const status = view.mapping.status;
    if (status === null) return null;
    const value = this.text(view.values, status.field.pointer);
    const transitionType =
      value !== undefined && Object.hasOwn(status.map, value) ? status.map[value] : undefined;
    if (value === undefined || transitionType === undefined) return null;
    const revision = view.updatedText ?? view.createdText ?? '';
    return {
      sourceFactId: `${view.ctx.kind}:${view.label}:status:${view.stream}:${view.id}:${revision}`,
      kind: 'transition',
      occurredAt: this.occurredAt(view, true),
      authors: view.authors,
      containerRefs: [view.containerId],
      sourceThreadId: view.containerId,
      transition: { transitionType, detail: { field: 'status', to: value } },
      sensitivityHints: view.hints,
      raw: view.raw,
    };
  }

  private occurredAt(view: ItemView, preferUpdated: boolean): Date {
    const ordered = preferUpdated
      ? [view.updatedAt, view.createdAt]
      : [view.createdAt, view.updatedAt];
    return ordered.find((date): date is Date => date !== null) ?? view.ctx.now();
  }
}

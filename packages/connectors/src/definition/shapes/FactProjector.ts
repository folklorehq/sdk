// SPDX-License-Identifier: Apache-2.0
import {
  declaredFields,
  type DeclaredField,
  type FactDefinition,
  type FactOutcomeCode,
} from '@folklore/contracts';
import { resolveJsonPointer } from '@folklore/utils';
import { FactGuards, REDACTION, type SensitiveAction } from './FactGuards.js';

export type FactScalar = string | number | boolean;

type Projection =
  | {
      readonly ok: true;
      readonly values: ReadonlyMap<string, FactScalar>;
      readonly outcomes: readonly FactOutcomeCode[];
    }
  | { readonly ok: false; readonly reason: FactOutcomeCode };

type Reading =
  | { readonly kind: 'absent' }
  | { readonly kind: 'value'; readonly value: FactScalar; readonly redacted?: true }
  | { readonly kind: 'refused'; readonly reason: FactOutcomeCode };

const MILLISECOND_FLOOR = 1e11;
const MILLISECONDS_PER_SECOND = 1000;
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
const EARLIEST_TIMESTAMP_MS = Date.UTC(1980, 0, 1);
const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?)?$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_SEPARATOR = /[Tt ]/;
const ZONE_DESIGNATOR = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;
const REDACTED_OUTCOME: FactOutcomeCode = 'sensitive_value_redacted';
const SINGLE_LINE_SLOTS: ReadonlySet<DeclaredField['slot']> = new Set(['title', 'attribute']);
// Joiners stay: Persian text and emoji sequences need them.
const LINE_BREAKS_AND_FORMAT = /[\r\n\u{2028}\u{2029}\u{85}\v\f]|(?![\u{200C}\u{200D}])\p{Cf}/gu;
const ABSENT: Reading = { kind: 'absent' };
const encoder = new TextEncoder();

export const scalarText = (value: FactScalar): string => String(value);

// A date-time with no zone is read as UTC, so the result never depends on the host zone.
function parseIso(text: string): number {
  if (DATE_ONLY.test(text) || ZONE_DESIGNATOR.test(text)) return Date.parse(text);
  return Date.parse(`${text.replace(DATE_TIME_SEPARATOR, 'T')}Z`);
}

export function timestampOf(value: FactScalar): Date | null {
  const milliseconds =
    typeof value === 'number'
      ? value >= MILLISECOND_FLOOR
        ? value
        : value * MILLISECONDS_PER_SECOND
      : typeof value === 'string' && ISO_8601.test(value)
        ? parseIso(value)
        : Number.NaN;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? null : date;
}

export class FactProjector {
  private readonly guards: FactGuards;

  constructor(
    private readonly now: () => Date,
    secrets: readonly string[],
  ) {
    this.guards = new FactGuards(secrets);
  }

  project(record: unknown, mapping: FactDefinition): Projection {
    const values = new Map<string, FactScalar>();
    let redacted = false;
    for (const declared of declaredFields(mapping)) {
      const reading = this.read(record, declared, mapping.guards.onSensitiveValue);
      if (reading.kind === 'refused') return { ok: false, reason: reading.reason };
      if (reading.kind === 'value') {
        values.set(declared.field.pointer, reading.value);
        redacted ||= reading.redacted === true;
      } else if (declared.field.required) return { ok: false, reason: 'missing_required' };
    }
    return { ok: true, values, outcomes: redacted ? [REDACTED_OUTCOME] : [] };
  }

  // The parent id alone is read, so a large or sensitive parent field is never scanned per child.
  identity(record: unknown, mapping: FactDefinition): FactScalar | undefined {
    const declared: DeclaredField = { slot: 'id', field: mapping.id, identity: true };
    const reading = this.read(record, declared, mapping.guards.onSensitiveValue);
    return reading.kind === 'value' ? reading.value : undefined;
  }

  private read(record: unknown, declared: DeclaredField, action: SensitiveAction): Reading {
    const found = resolveJsonPointer(record, declared.field.pointer);
    if (found === undefined || found === null || found === '') return ABSENT;
    const typed = this.typed(found, declared);
    if (typed.kind !== 'value') return typed;
    if (!this.bounded(declared, typed.value)) return this.refused('too_large');
    const value = this.singleLine(declared, typed.value);
    const verdict = this.guards.apply(declared, value, action);
    if (verdict.kind === 'rejected') return this.refused(verdict.reason);
    return verdict.kind === 'clean' ? { kind: 'value', value } : this.redacted(declared, verdict);
  }

  // Detection must see the text as it will be rendered, or a line break could split a match.
  private singleLine(declared: DeclaredField, value: FactScalar): FactScalar {
    if (typeof value !== 'string' || !SINGLE_LINE_SLOTS.has(declared.slot)) return value;
    return value.replace(LINE_BREAKS_AND_FORMAT, '');
  }

  private redacted(declared: DeclaredField, verdict: { readonly value: FactScalar }): Reading {
    const value = this.bounded(declared, verdict.value) ? verdict.value : REDACTION;
    if (!this.bounded(declared, value)) return this.refused(REDACTED_OUTCOME);
    return { kind: 'value', value, redacted: true };
  }

  private typed(found: unknown, declared: DeclaredField): Reading {
    switch (declared.field.type) {
      case 'short_text':
      case 'long_text':
        return typeof found === 'string'
          ? { kind: 'value', value: found }
          : this.refused('wrong_type');
      case 'boolean':
        return typeof found === 'boolean'
          ? { kind: 'value', value: found }
          : this.refused('wrong_type');
      case 'number':
        return this.number(found, declared.identity);
      case 'timestamp':
        return this.timestamp(found);
    }
  }

  private number(found: unknown, identity: boolean): Reading {
    if (typeof found !== 'number' || !Number.isFinite(found)) return this.refused('wrong_type');
    if (identity && !Number.isSafeInteger(found)) return this.refused('wrong_type');
    return { kind: 'value', value: found };
  }

  private timestamp(found: unknown): Reading {
    if (typeof found === 'number' && !Number.isFinite(found)) return this.refused('wrong_type');
    if (typeof found !== 'string' && typeof found !== 'number') return this.refused('wrong_type');
    const date = timestampOf(found);
    if (date === null) {
      return this.refused(typeof found === 'number' ? 'timestamp_out_of_range' : 'wrong_type');
    }
    const time = date.getTime();
    const inRange = time >= EARLIEST_TIMESTAMP_MS && time <= this.now().getTime() + MAX_FUTURE_MS;
    return inRange ? { kind: 'value', value: found } : this.refused('timestamp_out_of_range');
  }

  private refused(reason: FactOutcomeCode): Reading {
    return { kind: 'refused', reason };
  }

  private bounded(declared: DeclaredField, value: FactScalar): boolean {
    return encoder.encode(scalarText(value)).length <= declared.field.maxBytes;
  }
}

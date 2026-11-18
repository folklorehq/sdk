// SPDX-License-Identifier: Apache-2.0
import type { DeclaredField, FactDefinition, FactOutcomeCode } from '@folklore/contracts';
import type { FactScalar } from './FactProjector.js';
import { detectSensitive, type SensitiveSpan } from './sensitive-value-detectors.js';

export type SensitiveAction = FactDefinition['guards']['onSensitiveValue'];

type GuardVerdict =
  | { readonly kind: 'clean'; readonly value: FactScalar }
  | { readonly kind: 'redacted'; readonly value: FactScalar }
  | { readonly kind: 'rejected'; readonly reason: FactOutcomeCode };

export const REDACTION = '[redacted]';
// A redaction there could cut a tier-raising word or change the scope comparison.
const CLASSIFICATION_SLOTS: ReadonlySet<DeclaredField['slot']> = new Set(['sensitivity', 'name']);

export class FactGuards {
  constructor(private readonly secrets: readonly string[]) {}

  apply(
    declared: DeclaredField,
    value: FactScalar,
    onSensitiveValue: SensitiveAction,
  ): GuardVerdict {
    const text = String(value);
    const spans = detectSensitive(text, this.secrets, { cards: this.scansCards(declared, value) });
    if (spans.length === 0) return { kind: 'clean', value };
    if (declared.identity) return { kind: 'rejected', reason: 'identity_sensitive' };
    if (onSensitiveValue === 'drop_record' || CLASSIFICATION_SLOTS.has(declared.slot)) {
      return { kind: 'rejected', reason: 'sensitive_value_redacted' };
    }
    const redacted = typeof value === 'string' ? this.redact(text, spans) : REDACTION;
    return { kind: 'redacted', value: redacted };
  }

  private scansCards(declared: DeclaredField, value: FactScalar): boolean {
    if (declared.field.type === 'timestamp') return false;
    return !(declared.identity && typeof value === 'number');
  }

  private redact(text: string, spans: readonly SensitiveSpan[]): string {
    let result = '';
    let cursor = 0;
    for (const span of spans) {
      result += text.slice(cursor, span.start) + REDACTION;
      cursor = span.end;
    }
    return result + text.slice(cursor);
  }
}

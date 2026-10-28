// SPDX-License-Identifier: Apache-2.0
import type { FactMapping } from '@folklore/contracts';
import { resolveJsonPointer } from '@folklore/utils';
import type { SensitivityHints } from '../../normalized.js';

type Sensitivity = Extract<FactMapping, { shape: 'item' | 'comment' }>['sensitivity'];

export function sensitivityHintsFor(sensitivity: Sensitivity, source: unknown): SensitivityHints {
  return {
    names: namesAt(sensitivity.namesPointers, source),
    restrictedScope: isRestricted(sensitivity, source),
  };
}

function namesAt(pointers: readonly string[], source: unknown): string[] {
  const names = pointers
    .map((pointer) => resolveJsonPointer(source, pointer))
    .filter((value): value is string => typeof value === 'string' && value !== '');
  return [...new Set(names)];
}

// Fail closed: only an explicit match against a declared public value leaves the floor off.
function isRestricted(sensitivity: Sensitivity, source: unknown): boolean {
  const scope = sensitivity.restrictedScope;
  if (scope.mode === 'always') return true;
  const value = resolveJsonPointer(source, scope.pointer);
  return !scope.publicValues.some((publicValue) => publicValue === value);
}

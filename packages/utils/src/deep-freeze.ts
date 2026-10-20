// SPDX-License-Identifier: Apache-2.0
export function deepFreeze<T>(value: T): T {
  const pending: object[] = [];
  if (value !== null && typeof value === 'object') pending.push(value);
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || Object.isFrozen(current)) continue;
    for (const nested of Object.values(current)) {
      if (nested !== null && typeof nested === 'object') pending.push(nested);
    }
    Object.freeze(current);
  }
  return value;
}

// SPDX-License-Identifier: Apache-2.0
const DIGITS = /^\d+$/;

function parseRecordTime(value: unknown): Date | undefined {
  const milliseconds = toMilliseconds(value);
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function firstValidTime(now: () => Date, ...candidates: unknown[]): Date {
  for (const candidate of candidates) {
    const parsed = parseRecordTime(candidate);
    if (parsed) return parsed;
  }
  return now();
}

function toMilliseconds(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  return DIGITS.test(value) ? Number(value) : Date.parse(value);
}

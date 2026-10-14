// SPDX-License-Identifier: Apache-2.0
const DELTA_SECONDS = /^\d+$/;
const IMF_FIXDATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;
const MS_PER_SECOND = 1_000;

/** The wait an HTTP `Retry-After` value asks for, clamped to `[0, maxMs]`; undefined when invalid. */
export function parseRetryAfterMs(
  value: string | null | undefined,
  nowMs: number,
  maxMs: number,
): number | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const delayMs = requestedDelayMs(trimmed, nowMs);
  return delayMs === undefined ? undefined : Math.min(Math.max(delayMs, 0), maxMs);
}

function requestedDelayMs(value: string, nowMs: number): number | undefined {
  if (DELTA_SECONDS.test(value)) return Number(value) * MS_PER_SECOND;
  if (!IMF_FIXDATE.test(value)) return undefined;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : at - nowMs;
}

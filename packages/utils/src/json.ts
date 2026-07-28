// SPDX-License-Identifier: Apache-2.0
/** Strips markdown code fences some models wrap around JSON, then parses. */
export function parseJsonFence<T>(raw: string): T {
  const cleaned = raw.replace(/```(?:json)?/g, '').trim();
  return JSON.parse(cleaned) as T;
}

/** The first JSON object substring (first `{` to last `}`) in model output, or `{}`. */
export function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  return start === -1 || end <= start ? '{}' : raw.slice(start, end + 1);
}

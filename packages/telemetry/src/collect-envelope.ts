// SPDX-License-Identifier: Apache-2.0
export const ANALYTICS_COLLECT_PATH = '/v1/analytics/collect';
export const ANALYTICS_COLLECT_WIRE_VERSION = 1;
export const ANALYTICS_COLLECT_ENVELOPE_KEYS = ['v', 'event', 'properties'] as const;

export interface CollectEnvelope {
  readonly v: typeof ANALYTICS_COLLECT_WIRE_VERSION;
  readonly event: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export function parseCollectEnvelope(body: unknown): CollectEnvelope | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const keys = Reflect.ownKeys(body);
  const exact =
    keys.length === ANALYTICS_COLLECT_ENVELOPE_KEYS.length &&
    ANALYTICS_COLLECT_ENVELOPE_KEYS.every((key) => Object.hasOwn(body, key));
  if (!exact) return undefined;
  const { v, event, properties } = body as Record<string, unknown>;
  if (v !== ANALYTICS_COLLECT_WIRE_VERSION || typeof event !== 'string') return undefined;
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    return undefined;
  }
  return { v, event, properties: properties as Record<string, unknown> };
}

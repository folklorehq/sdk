// SPDX-License-Identifier: Apache-2.0
import { PostHog } from 'posthog-node';
import type { ErrorReport } from '@folklore/errors';
import type { TelemetryClient } from './ports.js';
import type { TelemetryEventName, TelemetryEventMap } from './events.js';
import { isServerTelemetryEvent, TelemetryEvent } from './events.js';
import { areServerTelemetryPropertiesValid } from './server-event-properties.js';
import { checkDistinctId } from './content-free.js';

const SYSTEM_ACTOR = 'system';

export class PostHogTelemetryClient implements TelemetryClient {
  private readonly client: PostHog;

  constructor(apiKey: string, host?: string) {
    this.client = new PostHog(apiKey, { host, flushAt: 20, flushInterval: 10_000 });
  }

  track<K extends TelemetryEventName>(
    event: K,
    distinctId: string,
    properties: TelemetryEventMap[K],
  ): void {
    this.capture(event, distinctId, properties as Record<string, unknown>);
  }

  captureError(report: ErrorReport, distinctId?: string): void {
    this.capture(TelemetryEvent.ErrorCaptured, distinctId ?? SYSTEM_ACTOR, report);
  }

  // Fail closed: a payload (or distinctId) that fails the content-free guard is dropped, never sent.
  private capture(event: unknown, distinctId: unknown, properties: unknown): void {
    const snapshot = snapshotProperties(properties);
    if (
      !snapshot ||
      !isServerTelemetryEvent(event) ||
      typeof distinctId !== 'string' ||
      checkDistinctId(distinctId) ||
      !areServerTelemetryPropertiesValid(event, snapshot)
    ) {
      return;
    }
    this.client.capture({ distinctId, event, properties: snapshot });
  }

  async flush(): Promise<void> {
    await this.client.shutdown();
  }
}

function snapshotProperties(value: unknown): Record<string, unknown> | null {
  try {
    if (!isPlainRecord(value)) return null;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') return null;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) return null;
      Object.defineProperty(snapshot, key, {
        configurable: false,
        enumerable: true,
        value: descriptor.value,
        writable: false,
      });
    }
    return Object.freeze(snapshot);
  } catch {
    return null;
  }
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

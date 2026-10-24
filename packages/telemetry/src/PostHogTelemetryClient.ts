// SPDX-License-Identifier: Apache-2.0
import { PostHog } from 'posthog-node';
import type { ErrorReport } from '@folklore/errors';
import type { TelemetryClient, TelemetryTrackOptions } from './ports.js';
import type { TelemetryEventName, TelemetryEventMap } from './events.js';
import { CATALOG_BACKED_BROWSER_EVENTS, isServerTelemetryEvent, TelemetryEvent } from './events.js';
import { areServerTelemetryPropertiesValid } from './server-event-properties.js';
import { checkDistinctId } from './content-free.js';

const SYSTEM_ACTOR = 'system';
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_EVENT_SKEW_MS = 5 * 60 * 1000;

export class PostHogTelemetryClient implements TelemetryClient {
  private readonly client: PostHog;

  constructor(apiKey: string, host?: string) {
    this.client = new PostHog(apiKey, {
      host,
      flushAt: 20,
      flushInterval: 10_000,
      disableGeoip: true,
    });
  }

  track<K extends TelemetryEventName>(
    event: K,
    distinctId: string,
    properties: TelemetryEventMap[K],
    options?: TelemetryTrackOptions,
  ): void {
    this.capture(event, distinctId, properties as Record<string, unknown>, options);
  }

  captureError(report: ErrorReport, distinctId?: string): void {
    this.capture(TelemetryEvent.ErrorCaptured, distinctId ?? SYSTEM_ACTOR, report);
  }

  // not yet wired (A1b): the catalog-taking relay; catalog-backed names are refused until it lands.
  // Fail closed: a payload (or distinctId) that fails the content-free guard is dropped, never sent.
  private capture(
    event: unknown,
    distinctId: unknown,
    properties: unknown,
    options?: unknown,
  ): void {
    const snapshot = snapshotProperties(properties);
    if (
      !snapshot ||
      !isServerTelemetryEvent(event) ||
      CATALOG_BACKED_BROWSER_EVENTS.has(event) ||
      typeof distinctId !== 'string' ||
      checkDistinctId(distinctId) ||
      !areServerTelemetryPropertiesValid(event, snapshot)
    ) {
      return;
    }
    const boundedTimestamp = this.boundedTimestamp(options);
    this.client.capture({
      distinctId,
      event,
      properties: snapshot,
      ...(boundedTimestamp ? { timestamp: boundedTimestamp } : {}),
    });
  }

  private boundedTimestamp(options: unknown): Date | undefined {
    try {
      const timestamp = (options as TelemetryTrackOptions | undefined)?.timestamp;
      if (!(timestamp instanceof Date)) return undefined;
      const ms = Date.prototype.getTime.call(timestamp) as number;
      const age = Date.now() - ms;
      return age <= MAX_EVENT_AGE_MS && age >= -MAX_EVENT_SKEW_MS ? new Date(ms) : undefined;
    } catch {
      return undefined;
    }
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

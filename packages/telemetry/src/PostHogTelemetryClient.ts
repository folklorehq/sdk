// SPDX-License-Identifier: Apache-2.0
import { PostHog } from 'posthog-node';
import type { ErrorReport } from '@folklore/errors';
import type { BrowserEventRelay, TelemetryClient, TelemetryTrackOptions } from './ports.js';
import type {
  BrowserCatalog,
  BrowserSurface,
  BrowserTelemetryEventName,
  TelemetryEventName,
  TelemetryEventMap,
} from './events.js';
import {
  areBrowserTelemetryPropertiesValid,
  BrowserTelemetryEvent,
  CATALOG_BACKED_BROWSER_EVENTS,
  isBrowserEventAllowedFrom,
  isBrowserTelemetryEvent,
  isServerTelemetryEvent,
  TelemetryEvent,
} from './events.js';
import { areServerTelemetryPropertiesValid } from './server-event-properties.js';
import { checkDistinctId } from './content-free.js';

const SYSTEM_ACTOR = 'system';
const MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_EVENT_SKEW_MS = 5 * 60 * 1000;

export class PostHogTelemetryClient implements TelemetryClient, BrowserEventRelay {
  constructor(
    apiKey: string,
    host?: string,
    private readonly client: Pick<PostHog, 'capture' | 'shutdown'> = new PostHog(apiKey, {
      host,
      flushAt: 20,
      flushInterval: 10_000,
      disableGeoip: true,
    }),
  ) {}

  track<K extends TelemetryEventName>(
    event: K,
    distinctId: string,
    properties: TelemetryEventMap[K],
    options?: TelemetryTrackOptions,
  ): void {
    this.captureServerEvent(event, distinctId, properties as Record<string, unknown>, options);
  }

  relayBrowserEvent(
    event: BrowserTelemetryEventName,
    surface: BrowserSurface,
    distinctId: string,
    properties: Record<string, unknown>,
    catalog: BrowserCatalog,
  ): boolean {
    const snapshot = snapshotProperties(properties);
    if (
      !snapshot ||
      typeof catalog !== 'object' ||
      catalog === null ||
      !isBrowserTelemetryEvent(event) ||
      !isBrowserEventAllowedFrom(event, surface) ||
      !areBrowserTelemetryPropertiesValid(event, snapshot, catalog)
    ) {
      return false;
    }
    const serverProperties =
      event === BrowserTelemetryEvent.RouteViewed ? { ...snapshot, surface } : snapshot;
    return this.captureCatalogChecked(event, distinctId, serverProperties);
  }

  captureError(report: ErrorReport, distinctId?: string): void {
    this.captureServerEvent(TelemetryEvent.ErrorCaptured, distinctId ?? SYSTEM_ACTOR, report);
  }

  private captureServerEvent(
    event: unknown,
    distinctId: unknown,
    properties: unknown,
    options?: unknown,
  ): boolean {
    if (isServerTelemetryEvent(event) && CATALOG_BACKED_BROWSER_EVENTS.has(event)) return false;
    return this.dispatch(event, distinctId, properties, options);
  }

  // Only `relayBrowserEvent` reaches this, after its catalog check.
  private captureCatalogChecked(event: unknown, distinctId: unknown, properties: unknown): boolean {
    return this.dispatch(event, distinctId, properties, undefined);
  }

  // Fail closed: a payload (or distinctId) that fails the content-free guard is dropped, never sent.
  private dispatch(
    event: unknown,
    distinctId: unknown,
    properties: unknown,
    options: unknown,
  ): boolean {
    const snapshot = snapshotProperties(properties);
    if (
      !snapshot ||
      !isServerTelemetryEvent(event) ||
      typeof distinctId !== 'string' ||
      checkDistinctId(distinctId) ||
      !areServerTelemetryPropertiesValid(event, snapshot)
    ) {
      return false;
    }
    const boundedTimestamp = this.boundedTimestamp(options);
    this.client.capture({
      distinctId,
      event,
      properties: snapshot,
      ...(boundedTimestamp ? { timestamp: boundedTimestamp } : {}),
    });
    return true;
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

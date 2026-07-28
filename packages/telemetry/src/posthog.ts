// SPDX-License-Identifier: Apache-2.0
import { PostHog } from 'posthog-node';
import type { ErrorReport } from '@folklore/errors';
import type { TelemetryClient } from './ports.js';
import type { TelemetryEventName, TelemetryEventMap } from './events.js';
import { TelemetryEvent } from './events.js';
import { checkContentFree, checkDistinctId } from './content-free.js';

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
    this.capture(TelemetryEvent.ErrorCaptured, distinctId ?? SYSTEM_ACTOR, { ...report });
  }

  // Fail closed: a payload (or distinctId) that fails the content-free guard is dropped, never sent (ADL #18).
  private capture(event: string, distinctId: string, properties: Record<string, unknown>): void {
    if (checkDistinctId(distinctId) || checkContentFree(event, properties)) return;
    this.client.capture({ distinctId, event, properties });
  }

  async flush(): Promise<void> {
    await this.client.shutdown();
  }
}

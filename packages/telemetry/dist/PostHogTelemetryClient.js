// SPDX-License-Identifier: Apache-2.0
import { PostHog } from 'posthog-node';
import { TelemetryEvent } from './events.js';
import { checkContentFree, checkDistinctId } from './content-free.js';
const SYSTEM_ACTOR = 'system';
export class PostHogTelemetryClient {
    client;
    constructor(apiKey, host) {
        this.client = new PostHog(apiKey, { host, flushAt: 20, flushInterval: 10_000 });
    }
    track(event, distinctId, properties) {
        this.capture(event, distinctId, properties);
    }
    captureError(report, distinctId) {
        this.capture(TelemetryEvent.ErrorCaptured, distinctId ?? SYSTEM_ACTOR, { ...report });
    }
    // Fail closed: a payload (or distinctId) that fails the content-free guard is dropped, never sent.
    capture(event, distinctId, properties) {
        if (checkDistinctId(distinctId) || checkContentFree(event, properties))
            return;
        this.client.capture({ distinctId, event, properties });
    }
    async flush() {
        await this.client.shutdown();
    }
}
//# sourceMappingURL=PostHogTelemetryClient.js.map
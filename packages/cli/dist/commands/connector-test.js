// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDefaultConnectorRegistry, normalizeWebhookEvent, } from '@folklore/connectors';
import { noopLogger } from '../noop-logger.js';
export function runConnectorTest(input) {
    const payload = JSON.parse(readFileSync(resolve(input.fixturePath), 'utf8'));
    const registry = input.registry ?? getDefaultConnectorRegistry();
    const records = registry.normalizeWebhook(input.kind, { type: input.eventType, payload }, { logger: noopLogger });
    if (records.facts.length === 0 && records.containers.length === 0) {
        throw new Error(`connector "${input.kind}" returned no records for event "${input.eventType}"`);
    }
    return records;
}
export function runConnectorTestWithDefaultNormalizer(input) {
    const payload = JSON.parse(readFileSync(resolve(input.fixturePath), 'utf8'));
    return normalizeWebhookEvent(input.kind, input.eventType, payload);
}
//# sourceMappingURL=connector-test.js.map
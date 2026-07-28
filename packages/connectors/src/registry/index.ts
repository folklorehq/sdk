// SPDX-License-Identifier: Apache-2.0
import type { ConnectorContext, WebhookEvent } from '../connector.js';
import type { NormalizedRecords } from '../normalized.js';
import { registerBuiltinConnectors } from './builtin.js';
import { ConnectorRegistry, type PullConnectorDeps } from './connector-registry.js';

const defaultRegistry = new ConnectorRegistry();
registerBuiltinConnectors(defaultRegistry);

export function getDefaultConnectorRegistry(): ConnectorRegistry {
  return defaultRegistry;
}

export function normalizeWebhookEvent(
  source: string,
  eventType: string,
  payload: unknown,
  ctx: ConnectorContext,
): NormalizedRecords {
  return defaultRegistry.normalizeWebhook(source, { type: eventType, payload }, ctx);
}

export function createPullConnector(kind: string, deps: PullConnectorDeps) {
  return defaultRegistry.createPullConnector(kind, deps);
}

export function listPullConnectorKinds(): string[] {
  return defaultRegistry.listPullKinds();
}

export type { PullConnectorDeps, ConnectorRegistration } from './connector-registry.js';
export { ConnectorRegistry } from './connector-registry.js';

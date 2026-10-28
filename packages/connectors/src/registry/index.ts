// SPDX-License-Identifier: Apache-2.0
import type { ConnectorContext } from '../connector.js';
import type { NormalizedRecords } from '../normalized.js';
import { registerConnectorDefinitions } from '../definition/definitions.js';
import { CONNECTOR_DEFINITIONS, SHAPE_ADAPTERS } from '../definition/registry.js';
import { ConnectorRegistry, type PullConnectorDeps } from './ConnectorRegistry.js';

const defaultRegistry = new ConnectorRegistry();
registerConnectorDefinitions(defaultRegistry, CONNECTOR_DEFINITIONS, SHAPE_ADAPTERS);

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

export type { PullConnectorDeps, ConnectorRegistration } from './ConnectorRegistry.js';
export { ConnectorRegistry } from './ConnectorRegistry.js';

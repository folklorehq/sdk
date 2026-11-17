// SPDX-License-Identifier: Apache-2.0
import type { ConnectorSpec, IdentitySpec } from '@folklore/contracts';
import type { ConnectorContext } from '../connector.js';
import type { NormalizedRecords } from '../normalized.js';
import { registerConnectorDefinitions, type AnyDefinition } from '../definition/definitions.js';
import { CONNECTOR_DEFINITIONS, SHAPE_ADAPTERS } from '../definition/registry.js';
import { ConnectorRegistry, type PullConnectorDeps } from './ConnectorRegistry.js';

const SPEC_DEFINITIONS = new Map<string, ConnectorSpec>(
  Object.values<AnyDefinition>(CONNECTOR_DEFINITIONS).flatMap((definition) =>
    'spec' in definition ? [[definition.kind, definition.spec] as const] : [],
  ),
);

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

export function isSpecConnectorKind(kind: string): boolean {
  return SPEC_DEFINITIONS.has(kind);
}

export function specIdentityFor(kind: string): IdentitySpec | null {
  return SPEC_DEFINITIONS.get(kind)?.identity ?? null;
}

export function listPullConnectorKinds(): string[] {
  return defaultRegistry.listPullKinds();
}

export type { PullConnectorDeps, ConnectorRegistration } from './ConnectorRegistry.js';
export { ConnectorRegistry } from './ConnectorRegistry.js';

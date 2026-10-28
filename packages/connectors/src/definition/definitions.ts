// SPDX-License-Identifier: Apache-2.0
import {
  CONNECTOR_MANIFESTS,
  type ConnectorManifest,
  type ConnectorSpec,
  type ManifestKind,
} from '@folklore/contracts';
import { ConnectorSpecError } from '@folklore/errors';
import type { Connector, ConnectorContext } from '../connector.js';
import type {
  ConnectorRegistration,
  ConnectorRegistry,
  PullConnectorDeps,
  PullConnectorFactory,
  WebhookConnectorFactory,
} from '../registry/ConnectorRegistry.js';
import type { ShapeAdapters } from './shape-adapters.js';
import { SpecConnector } from './SpecConnector.js';

export interface ConnectorDefinition<K extends ManifestKind> {
  readonly kind: K;
  readonly createForPull?: PullConnectorFactory;
  readonly createForWebhook?: WebhookConnectorFactory;
}

export interface SpecDefinition<K extends ManifestKind> {
  readonly kind: K;
  readonly spec: ConnectorSpec;
}

export type AnyDefinition = ConnectorDefinition<ManifestKind> | SpecDefinition<ManifestKind>;

export function webhookOnly<TClient>(
  ConnectorClass: new (ctx: ConnectorContext, client: TClient) => Connector,
): WebhookConnectorFactory {
  return (ctx) => new ConnectorClass(ctx, null as unknown as TClient);
}

export function registerConnectorDefinitions(
  registry: ConnectorRegistry,
  definitions: Readonly<Record<string, AnyDefinition>>,
  shapes: ShapeAdapters,
  manifests: readonly ConnectorManifest[] = CONNECTOR_MANIFESTS,
): void {
  for (const definition of Object.values(definitions)) {
    registry.register(registrationOf(definition, shapes, manifests));
  }
}

function registrationOf(
  definition: AnyDefinition,
  shapes: ShapeAdapters,
  manifests: readonly ConnectorManifest[],
): ConnectorRegistration {
  if (!('spec' in definition)) return definition;
  const manifest = manifests.find((candidate) => candidate.kind === definition.kind);
  if (!manifest) throw new ConnectorSpecError('spec_manifest_missing');
  return {
    kind: definition.kind,
    createForPull: (deps) => specConnectorFor(definition.spec, manifest, shapes, deps),
  };
}

function specConnectorFor(
  spec: ConnectorSpec,
  manifest: ConnectorManifest,
  shapes: ShapeAdapters,
  deps: PullConnectorDeps,
): SpecConnector {
  if (!deps.connectorTransport) throw new ConnectorSpecError('spec_transport_missing');
  return new SpecConnector(
    { logger: deps.logger },
    {
      spec,
      manifest,
      transport: deps.connectorTransport,
      shapes,
      ...(deps.externalTenantId ? { externalTenantId: deps.externalTenantId } : {}),
    },
  );
}

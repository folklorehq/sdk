// SPDX-License-Identifier: Apache-2.0
import { parseSourceKey } from '@folklore/contracts';
import type { ConnectorTransport, Logger } from '@folklore/core';
import type { Connector, ConnectorContext, WebhookEvent } from '../connector.js';
import type { NormalizedRecords } from '../normalized.js';
import type { CodebaseRepositorySelection } from '../code-selection.js';
import type { DocumentBodyMode } from '../document-body.js';

/** Enclave/runtime deps for constructing a pull-capable connector instance. */
export interface PullConnectorDeps {
  logger: Logger;
  token: string;
  externalTenantId?: string;
  httpsProxyAgent?: unknown;
  gmailLabelAllowlist?: string[];
  m365FolderAllowlist?: string[];
  codebaseSelection?: CodebaseRepositorySelection;
  exportedPageIds?: ReadonlySet<string>;
  // UNWIRED: no connector reads the body mode yet.
  documentBodies?: DocumentBodyMode;
  // UNWIRED: the enclave supplies a transport once spec kinds are switched on.
  connectorTransport?: ConnectorTransport;
  // UNWIRED: the enclave runtime supplies the connection's secret parts later.
  secrets?: readonly string[];
}

export type WebhookConnectorFactory = (ctx: ConnectorContext) => Connector;
export type PullConnectorFactory = (deps: PullConnectorDeps) => Connector;

export interface ConnectorRegistration {
  readonly kind: string;
  readonly createForWebhook?: WebhookConnectorFactory;
  readonly createForPull?: PullConnectorFactory;
}

export class ConnectorRegistry {
  private readonly byKind = new Map<string, ConnectorRegistration>();

  register(registration: ConnectorRegistration): void {
    if (this.byKind.has(registration.kind)) {
      throw new Error(`duplicate connector kind: ${registration.kind}`);
    }
    this.byKind.set(registration.kind, registration);
  }

  normalizeWebhook(kind: string, event: WebhookEvent, ctx: ConnectorContext): NormalizedRecords {
    const registration = this.registrationFor(kind);
    if (!registration?.createForWebhook) {
      return { facts: [], containers: [] };
    }
    return registration.createForWebhook(ctx).normalizeWebhook(event);
  }

  createPullConnector(kind: string, deps: PullConnectorDeps): Connector | null {
    const registration = this.registrationFor(kind);
    if (!registration?.createForPull) {
      return null;
    }
    return registration.createForPull(deps);
  }

  private registrationFor(key: string): ConnectorRegistration | undefined {
    return this.byKind.get(parseSourceKey(key)?.kind ?? key);
  }

  listPullKinds(): string[] {
    return [...this.byKind.entries()]
      .filter(([, registration]) => registration.createForPull !== undefined)
      .map(([kind]) => kind);
  }
}

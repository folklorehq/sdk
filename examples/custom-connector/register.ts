// SPDX-License-Identifier: Apache-2.0
import {
  ConnectorRegistry,
  getDefaultConnectorRegistry,
  type ConnectorRegistration,
} from '@folklore/connectors';
import { StandupConnector } from './connector.js';

export function registerStandupConnector(
  registry: ConnectorRegistry = getDefaultConnectorRegistry(),
) {
  const registration: ConnectorRegistration = {
    kind: 'standup_bot',
    createForWebhook: (ctx) => new StandupConnector(ctx),
  };
  registry.register(registration);
  return registry;
}

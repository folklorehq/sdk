// SPDX-License-Identifier: Apache-2.0
import { LinearClient } from '@linear/sdk';
import type { ConnectorDefinition } from '../definition/definitions.js';
import type { PullConnectorDeps } from '../registry/ConnectorRegistry.js';
import type { LinearApiClient } from './client.js';
import { LinearConnector } from './LinearConnector.js';
import { LinearGraphqlClient } from './LinearGraphqlClient.js';

export function linearPullConnector(
  deps: PullConnectorDeps,
  client: LinearApiClient = new LinearGraphqlClient(
    new LinearClient({ accessToken: deps.token }).client,
  ),
  now?: () => Date,
): LinearConnector {
  return new LinearConnector({ logger: deps.logger }, client, now);
}

export const linearDefinition = {
  kind: 'linear',
  createForPull: (deps) => linearPullConnector(deps),
} satisfies ConnectorDefinition<'linear'>;

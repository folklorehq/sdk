// SPDX-License-Identifier: Apache-2.0
import type { Agent } from 'node:http';
import type { PUBLIC_CONNECTOR_MANIFESTS } from '@folklore/contracts';
import { GitHubConnector } from '../github/GitHubConnector.js';
import { OctokitGitHubClient } from '../github/OctokitGitHubClient.js';
import { SlackConnector } from '../slack/SlackConnector.js';
import { HttpSlackClient } from '../slack/HttpSlackClient.js';
import { linearDefinition } from '../linear/linear-definition.js';
import { JiraConnector } from '../jira/JiraConnector.js';
import { JiraHttpClient } from '../jira/JiraHttpClient.js';
import { NotionConnector } from '../notion/NotionConnector.js';
import { NotionClient } from '../notion/NotionClient.js';
import { IntercomConnector } from '../intercom/IntercomConnector.js';
import { IntercomSdkClient } from '../intercom/IntercomSdkClient.js';
import { MeetingConnector } from '../meeting/MeetingConnector.js';
import type { ConnectorDefinition, SpecDefinition } from './definitions.js';
import { webhookOnly } from './definitions.js';
import { GENERIC_SHAPE_ADAPTERS } from './generic-shapes.js';
import type { ShapeAdapters } from './shape-adapters.js';

type PublicRunnableKind = Extract<
  (typeof PUBLIC_CONNECTOR_MANIFESTS)[number],
  { readonly pull: object } | { readonly webhook: object }
>['kind'];

/** Built-in connectors published in folklorehq/sdk. */
export const CONNECTOR_DEFINITIONS = {
  github: {
    kind: 'github',
    createForWebhook: webhookOnly(GitHubConnector),
    createForPull: (deps) =>
      new GitHubConnector(
        { logger: deps.logger },
        new OctokitGitHubClient(deps.token, { logger: deps.logger }),
      ),
  },

  slack: {
    kind: 'slack',
    createForWebhook: webhookOnly(SlackConnector),
    createForPull: (deps) =>
      new SlackConnector(
        { logger: deps.logger },
        new HttpSlackClient(deps.token, deps.httpsProxyAgent as Agent | undefined),
      ),
  },

  linear: linearDefinition,

  jira: {
    kind: 'jira',
    createForWebhook: webhookOnly(JiraConnector),
    createForPull: (deps) =>
      new JiraConnector(
        { logger: deps.logger },
        new JiraHttpClient(deps.token, deps.externalTenantId),
      ),
  },

  notion: {
    kind: 'notion',
    createForWebhook: webhookOnly(NotionConnector),
    createForPull: (deps) =>
      new NotionConnector(
        { logger: deps.logger },
        new NotionClient(deps.token),
        deps.exportedPageIds ? { exportedPageIds: deps.exportedPageIds } : {},
      ),
  },

  intercom: {
    kind: 'intercom',
    createForWebhook: webhookOnly(IntercomConnector),
    createForPull: (deps) =>
      new IntercomConnector({ logger: deps.logger }, new IntercomSdkClient(deps.token)),
  },

  meeting: {
    kind: 'meeting',
    createForWebhook: (ctx) => new MeetingConnector(ctx),
  },
} satisfies { [K in PublicRunnableKind]: ConnectorDefinition<K> | SpecDefinition<K> };

export const SHAPE_ADAPTERS: ShapeAdapters = { ...GENERIC_SHAPE_ADAPTERS };

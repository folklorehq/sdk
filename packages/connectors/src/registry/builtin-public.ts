// SPDX-License-Identifier: Apache-2.0
import type { Agent } from 'node:http';
import { GitHubConnector } from '../github/GitHubConnector.js';
import { OctokitGitHubClient } from '../github/OctokitGitHubClient.js';
import { SlackConnector } from '../slack/SlackConnector.js';
import { HttpSlackClient } from '../slack/HttpSlackClient.js';
import { LinearConnector } from '../linear/LinearConnector.js';
import { LinearSdkClient } from '../linear/LinearSdkClient.js';
import { JiraConnector } from '../jira/JiraConnector.js';
import { JiraHttpClient } from '../jira/JiraHttpClient.js';
import { NotionConnector } from '../notion/NotionConnector.js';
import { NotionClient } from '../notion/NotionClient.js';
import { IntercomConnector } from '../intercom/IntercomConnector.js';
import { IntercomSdkClient } from '../intercom/IntercomSdkClient.js';
import { MeetingConnector } from '../meeting/MeetingConnector.js';
import type { Connector, ConnectorContext } from '../connector.js';
import { ConnectorRegistry } from './ConnectorRegistry.js';

function webhookOnly<TClient>(
  ConnectorClass: new (ctx: ConnectorContext, client: TClient) => Connector,
): (ctx: ConnectorContext) => Connector {
  return (ctx) => new ConnectorClass(ctx, null as unknown as TClient);
}

/** Built-in connectors published in folklorehq/sdk. */
export function registerBuiltinConnectors(registry: ConnectorRegistry): void {
  registry.register({
    kind: 'github',
    createForWebhook: webhookOnly(GitHubConnector),
    createForPull: (deps) =>
      new GitHubConnector({ logger: deps.logger }, new OctokitGitHubClient(deps.token)),
  });

  registry.register({
    kind: 'slack',
    createForWebhook: webhookOnly(SlackConnector),
    createForPull: (deps) =>
      new SlackConnector(
        { logger: deps.logger },
        new HttpSlackClient(deps.token, deps.httpsProxyAgent as Agent | undefined),
      ),
  });

  registry.register({
    kind: 'linear',
    createForWebhook: webhookOnly(LinearConnector),
    createForPull: (deps) =>
      new LinearConnector({ logger: deps.logger }, new LinearSdkClient(deps.token)),
  });

  registry.register({
    kind: 'jira',
    createForWebhook: webhookOnly(JiraConnector),
    createForPull: (deps) =>
      new JiraConnector(
        { logger: deps.logger },
        new JiraHttpClient(deps.token, deps.externalTenantId),
      ),
  });

  registry.register({
    kind: 'notion',
    createForWebhook: webhookOnly(NotionConnector),
    createForPull: (deps) =>
      new NotionConnector({ logger: deps.logger }, new NotionClient(deps.token)),
  });

  registry.register({
    kind: 'intercom',
    createForWebhook: webhookOnly(IntercomConnector),
    createForPull: (deps) =>
      new IntercomConnector({ logger: deps.logger }, new IntercomSdkClient(deps.token)),
  });

  registry.register({
    kind: 'meeting',
    createForWebhook: (ctx) => new MeetingConnector(ctx),
  });
}

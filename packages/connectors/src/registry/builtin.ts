// SPDX-License-Identifier: Apache-2.0
import type { Agent } from 'node:http';
import type { GitHubClient } from '../github/client.js';
import { GitHubConnector } from '../github/connector.js';
import { OctokitGitHubClient } from '../github/octokit-client.js';
import type { SlackClient } from '../slack/client.js';
import { SlackConnector } from '../slack/connector.js';
import { HttpSlackClient } from '../slack/http-client.js';
import type { LinearApiClient } from '../linear/client.js';
import { LinearConnector } from '../linear/connector.js';
import { LinearSdkClient } from '../linear/sdk-client.js';
import type { JiraApiClient } from '../jira/client.js';
import { JiraConnector } from '../jira/connector.js';
import { JiraHttpClient } from '../jira/http-client.js';
import type { NotionApiClient } from '../notion/client.js';
import { NotionConnector } from '../notion/connector.js';
import { NotionClient } from '../notion/notion-client.js';
import type { IntercomApiClient } from '../intercom/client.js';
import { IntercomConnector } from '../intercom/connector.js';
import { IntercomSdkClient } from '../intercom/http-client.js';
import { MeetingConnector } from '../meeting/connector.js';
import type { Connector, ConnectorContext } from '../connector.js';
import { ConnectorRegistry } from './connector-registry.js';

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
      new JiraConnector({ logger: deps.logger }, new JiraHttpClient(deps.token)),
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

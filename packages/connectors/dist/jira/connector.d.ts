import { BaseConnector } from '../base-connector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { JiraApiClient } from './client.js';
export declare class JiraConnector extends BaseConnector {
    private readonly client;
    readonly kind = "jira";
    constructor(context: ConnectorContext, client: JiraApiClient);
    listResources(): Promise<NormalizedResource[]>;
    pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
    normalizeWebhook(event: WebhookEvent): NormalizedRecords;
    private issueEvent;
}
//# sourceMappingURL=connector.d.ts.map
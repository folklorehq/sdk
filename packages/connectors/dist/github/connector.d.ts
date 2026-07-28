import { BaseConnector } from '../base-connector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { GitHubClient } from './client.js';
export declare class GitHubConnector extends BaseConnector {
    private readonly client;
    readonly kind = "github";
    constructor(context: ConnectorContext, client: GitHubClient);
    listResources(): Promise<NormalizedResource[]>;
    pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
    normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
//# sourceMappingURL=connector.d.ts.map
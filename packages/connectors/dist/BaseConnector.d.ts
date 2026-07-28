import type { Logger } from '@folklore/core';
import { type AppError } from '@folklore/errors';
import type { Connector, ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from './connector.js';
import type { NormalizedRecords, NormalizedResource } from './normalized.js';
/** Shared connector machinery: injected logger + `call()`, which maps transport failures onto typed `@folklore/errors` so ingestion workers can apply retry/backoff uniformly. */
export declare abstract class BaseConnector implements Connector {
    abstract readonly kind: string;
    protected readonly logger: Logger;
    constructor(context: ConnectorContext);
    abstract listResources(): Promise<NormalizedResource[]>;
    abstract pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
    abstract normalizeWebhook(event: WebhookEvent): NormalizedRecords;
    protected call<T>(operation: string, fn: () => Promise<T>): Promise<T>;
    protected mapError(operation: string, err: unknown): AppError;
}
//# sourceMappingURL=BaseConnector.d.ts.map
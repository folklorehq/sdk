import { BaseApiClient } from '../BaseApiClient.js';
import type { NotionApiClient } from './client.js';
import type { NotionPage } from './types.js';
export declare class NotionClient extends BaseApiClient implements NotionApiClient {
    private readonly sdk;
    constructor(token: string);
    listPages(updatedSince?: string): Promise<NotionPage[]>;
}
//# sourceMappingURL=NotionClient.d.ts.map
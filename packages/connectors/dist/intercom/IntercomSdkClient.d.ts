import { BaseApiClient } from '../BaseApiClient.js';
import type { IntercomApiClient } from './client.js';
import type { IntercomConversation } from './types.js';
export declare class IntercomSdkClient extends BaseApiClient implements IntercomApiClient {
    private readonly sdk;
    constructor(token: string);
    listConversations(updatedSince?: number): Promise<IntercomConversation[]>;
    private toAuthor;
}
//# sourceMappingURL=IntercomSdkClient.d.ts.map
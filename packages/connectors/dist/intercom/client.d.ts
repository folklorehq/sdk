import type { IntercomConversation } from './types.js';
export interface IntercomApiClient {
    listConversations(updatedSince?: number): Promise<IntercomConversation[]>;
}
//# sourceMappingURL=client.d.ts.map
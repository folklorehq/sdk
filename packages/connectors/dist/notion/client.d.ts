import type { NotionPage } from './types.js';
export interface NotionApiClient {
    listPages(updatedSince?: string): Promise<NotionPage[]>;
}
//# sourceMappingURL=client.d.ts.map
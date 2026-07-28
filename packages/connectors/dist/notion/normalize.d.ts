import type { NormalizedRecords } from '../normalized.js';
import type { NotionCommentEvent, NotionPageEvent } from './types.js';
export declare function notionPageContainerId(pageId: string): string;
export declare function normalizeNotionPageEvent(event: NotionPageEvent): NormalizedRecords;
export declare function normalizeNotionCommentEvent(event: NotionCommentEvent): NormalizedRecords;
//# sourceMappingURL=normalize.d.ts.map
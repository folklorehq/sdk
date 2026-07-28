import type { NormalizedRecords } from '../normalized.js';
import type { SlackMessage, SlackReactionEvent } from './types.js';
export declare function slackThreadId(channelId: string, threadTs: string): string;
export declare function normalizeSlackReaction(event: SlackReactionEvent): NormalizedRecords;
export declare function normalizeSlackMessage(msg: SlackMessage): NormalizedRecords;
//# sourceMappingURL=normalize.d.ts.map
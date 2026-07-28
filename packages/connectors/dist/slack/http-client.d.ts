import type { Agent } from 'node:http';
import { BaseApiClient } from '../base-client.js';
import type { SlackClient, SlackConversation, SlackMessagesResult } from './client.js';
export declare class HttpSlackClient extends BaseApiClient implements SlackClient {
    private readonly client;
    constructor(token: string, agent?: Agent);
    listConversations(): Promise<SlackConversation[]>;
    listMessages(channelId: string, oldest?: string, cursor?: string): Promise<SlackMessagesResult>;
}
//# sourceMappingURL=http-client.d.ts.map
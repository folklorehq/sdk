// SPDX-License-Identifier: Apache-2.0
import type { IntercomConversation } from './types.js';

export interface IntercomConversationPage {
  conversations: IntercomConversation[];
  /** Set when more pages remain in this window; the connector persists it to resume mid-drain. */
  nextStartingAfter?: string;
  /** Ids of conversations whose Retrieve failed and fell back to their list/search summary (no parts) — the connector excludes these from its watermark advance so they're retried, never skipped forever. */
  retrieveFailedConversationIds: string[];
  /** Conversations whose part count exceeds Intercom's 500-per-Retrieve hard cap — parts past the cap are permanently unrecoverable (see IntercomSdkClient.toParts). */
  truncatedConversations?: number;
  /** Conversation parts dropped because Intercom returned no part id — see IntercomSdkClient.toParts. */
  partsMissingId?: number;
}

export interface IntercomApiClient {
  listConversations(
    updatedSince: number | undefined,
    startingAfter: string | undefined,
  ): Promise<IntercomConversationPage>;
}

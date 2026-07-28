// SPDX-License-Identifier: Apache-2.0
import type { IntercomConversation } from './types.js';

export interface IntercomApiClient {
  listConversations(updatedSince?: number): Promise<IntercomConversation[]>;
}

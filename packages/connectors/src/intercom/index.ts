// SPDX-License-Identifier: Apache-2.0
export { IntercomConnector } from './IntercomConnector.js';
export { IntercomSdkClient } from './IntercomSdkClient.js';
export type { IntercomApiClient, IntercomConversationPage } from './client.js';
export {
  normalizeIntercomEvent,
  normalizeIntercomConversationParts,
  intercomConversationId,
} from './normalize.js';
export type {
  IntercomNotificationEvent,
  IntercomConversation,
  IntercomConversationPart,
} from './types.js';

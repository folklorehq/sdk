// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import type { PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import { normalizeDirectUpload, normalizeVttUpload } from './normalize.js';
import type { DirectUploadPayload, VttUploadPayload } from './types.js';

export class MeetingConnector extends BaseConnector {
  readonly kind = 'meeting';

  async listResources(): Promise<NormalizedResource[]> {
    return [];
  }

  async pull(_cursor: SyncCursor, _options?: PullOptions): Promise<PullResult> {
    return { containers: [], facts: [], cursor: { value: null }, hasMore: false };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    switch (event.type) {
      case 'direct_upload':
        return normalizeDirectUpload(event.payload as DirectUploadPayload);
      case 'vtt_upload':
        return normalizeVttUpload(event.payload as VttUploadPayload);
      default:
        return { containers: [], facts: [] };
    }
  }
}

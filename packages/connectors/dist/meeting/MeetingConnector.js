// SPDX-License-Identifier: Apache-2.0
import { BaseConnector } from '../BaseConnector.js';
import { normalizeDirectUpload, normalizeVttUpload } from './normalize.js';
export class MeetingConnector extends BaseConnector {
    kind = 'meeting';
    constructor(context) {
        super(context);
    }
    async listResources() {
        return [];
    }
    async pull(_cursor, _options) {
        return { containers: [], facts: [], cursor: { value: null }, hasMore: false };
    }
    normalizeWebhook(event) {
        switch (event.type) {
            case 'direct_upload':
                return normalizeDirectUpload(event.payload);
            case 'vtt_upload':
                return normalizeVttUpload(event.payload);
            default:
                return { containers: [], facts: [] };
        }
    }
}
//# sourceMappingURL=MeetingConnector.js.map
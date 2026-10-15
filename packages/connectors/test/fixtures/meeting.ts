// SPDX-License-Identifier: Apache-2.0
import type { DirectUploadPayload } from '../../src/meeting/index.js';

export function directUpload(): DirectUploadPayload {
  return {
    id: 'meet-1',
    title: 'Q3 roadmap sync',
    startedAt: '2026-01-01T00:00:00Z',
    participants: [
      { id: 'p1', displayName: 'Alice' },
      { id: 'p2', displayName: 'Bob' },
    ],
    segments: [
      { speakerId: 'p1', text: 'Kicking things off.', startMs: 0 },
      { speakerId: 'p2', text: 'Sounds good.', startMs: 5000 },
    ],
  };
}

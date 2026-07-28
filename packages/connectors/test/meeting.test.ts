// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import { MeetingConnector } from '../src/meeting/index.js';
import type { DirectUploadPayload } from '../src/meeting/index.js';
import { normalizeVttUpload } from '../src/meeting/normalize.js';

const VTT = ['WEBVTT', '', '1', '00:00:00.000 --> 00:00:02.000', '<v Alice>Hello team.', ''].join(
  '\n',
);

function connector(): MeetingConnector {
  return new MeetingConnector({ logger: new PinoLogger({ level: 'silent' }) });
}

function directUpload(): DirectUploadPayload {
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

describe('MeetingConnector — structural entities', () => {
  it('tags every segment fact with the meeting id', () => {
    const result = connector().normalizeWebhook({ type: 'direct_upload', payload: directUpload() });
    expect(result.facts).toHaveLength(2);
    for (const fact of result.facts) {
      expect(fact.entities).toEqual(['meeting:meet-1']);
    }
  });

  it('never surfaces the free-text title or participants as entities', () => {
    const result = connector().normalizeWebhook({ type: 'direct_upload', payload: directUpload() });
    const flattened = result.facts.flatMap((f) => f.entities ?? []);
    expect(flattened.some((e) => e.includes('roadmap'))).toBe(false);
    expect(flattened).not.toContain('p1');
    expect(flattened).not.toContain('Alice');
  });
});

describe('normalizeVttUpload — stable id + participant enrichment', () => {
  it('uses the supplied id for a deterministic container across re-pulls', () => {
    const a = normalizeVttUpload({
      id: 'zoom:m1',
      title: 'Sync',
      startedAt: '2026-01-01T00:00:00Z',
      vtt: VTT,
    });
    const b = normalizeVttUpload({
      id: 'zoom:m1',
      title: 'Sync',
      startedAt: '2026-01-01T00:00:00Z',
      vtt: VTT,
    });
    expect(a.containers[0]!.sourceContainerId).toBe('meeting:zoom:m1');
    expect(b.containers[0]!.sourceContainerId).toBe('meeting:zoom:m1');
  });

  it('attaches emails to VTT-derived speakers matched by display name', () => {
    const result = normalizeVttUpload({
      id: 'zoom:m1',
      title: 'Sync',
      startedAt: '2026-01-01T00:00:00Z',
      vtt: VTT,
      participants: [{ id: 'x', displayName: 'Alice', email: 'alice@example.com' }],
    });
    expect(result.facts[0]!.authors[0]!.email).toBe('alice@example.com');
  });

  it('falls back to a random id when none is supplied', () => {
    const result = normalizeVttUpload({
      title: 'Sync',
      startedAt: '2026-01-01T00:00:00Z',
      vtt: VTT,
    });
    expect(result.containers[0]!.sourceContainerId).toMatch(/^meeting:[0-9a-f-]{36}$/);
  });
});

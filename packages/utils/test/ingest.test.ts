// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ingestWebhookUrl, platformWebhookOrigin } from '../src/index.js';

describe('ingestWebhookUrl', () => {
  it('yields the per-tenant ingest path, with or without a trailing slash on the base', () => {
    expect(ingestWebhookUrl('https://ingest.example.com/', 'org-1', 'zoom')).toBe(
      'https://ingest.example.com/ingest/org-1/zoom',
    );
    expect(ingestWebhookUrl('https://ingest.example.com', 'org-2', 'github')).toBe(
      'https://ingest.example.com/ingest/org-2/github',
    );
  });
});

describe('platformWebhookOrigin', () => {
  it('accepts only the platform host over https and refuses everything else', () => {
    expect(platformWebhookOrigin('https://webhooks.folklorehq.com')).toBe(
      'https://webhooks.folklorehq.com',
    );
    for (const refused of [
      undefined,
      'http://webhooks.folklorehq.com',
      'https://webhooks.folklorehq.com.evil.example',
      'https://staging-webhooks.folklorehq.com',
      'https://webhooks.folklorehq.com:8443',
      'https://user@webhooks.folklorehq.com',
      'https://webhooks.folklorehq.com/prefix',
      'not a url',
    ]) {
      expect(platformWebhookOrigin(refused), String(refused)).toBeNull();
    }
  });
});

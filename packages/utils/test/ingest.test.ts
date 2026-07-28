// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ingestWebhookUrl } from '../src/index.js';

describe('ingestWebhookUrl', () => {
  it('strips a trailing slash and yields the per-tenant ingest path', () => {
    expect(ingestWebhookUrl('https://ingest.example.com/', 'org-1', 'zoom')).toBe(
      'https://ingest.example.com/ingest/org-1/zoom',
    );
  });

  it('leaves a slash-free base unchanged', () => {
    expect(ingestWebhookUrl('https://ingest.example.com', 'org-2', 'github')).toBe(
      'https://ingest.example.com/ingest/org-2/github',
    );
  });
});

// SPDX-License-Identifier: Apache-2.0
import type { NotionPage, NotionPageEvent } from '../../src/notion/index.js';

export const PAGE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

export function makePage(overrides: Partial<NotionPage> = {}): NotionPage {
  return {
    object: 'page',
    id: PAGE_UUID,
    created_time: '2026-01-01T00:00:00Z',
    last_edited_time: '2026-01-02T00:00:00Z',
    created_by: { id: 'user-1', object: 'user' },
    last_edited_by: { id: 'user-2', object: 'user' },
    parent: { type: 'workspace', workspace: true },
    properties: {
      title: { title: [{ plain_text: 'My Page Title' }] },
    },
    url: `https://notion.so/${PAGE_UUID}`,
    archived: false,
    ...overrides,
  };
}

export function makePageEvent(
  type: 'page.created' | 'page.updated' = 'page.created',
): NotionPageEvent {
  return {
    type,
    page: makePage(),
    workspace_id: 'ws-1',
  };
}

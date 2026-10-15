// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isCanonicalLinkKey } from '@folklore/utils';
import { jiraIssueContainerId } from '../src/jira/index.js';
import { linearIssueContainerId } from '../src/linear/index.js';
import type { LinearTeam } from '../src/linear/types.js';
import type { JiraIssue } from '../src/jira/types.js';
import {
  normalizeNotionPageEvent,
  normalizeNotionPageSeed,
  notionPageContainerId,
} from '../src/notion/index.js';
import type { NotionPage } from '../src/notion/types.js';
import { normalizeSlackMessage, slackThreadId } from '../src/slack/index.js';
import type { SlackMessage } from '../src/slack/types.js';

const NOTION_FIXTURE_PAGE_IDS = ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'];
const LINEAR_FIXTURES: Array<{ team: LinearTeam; issueNumber: number }> = [
  { team: { id: 'team-uuid', name: 'Engineering', key: 'ENG' }, issueNumber: 42 },
];
const SLACK_FIXTURES = [
  { channel: 'C12345', ts: '1700000000.000001' },
  { channel: 'C12345', ts: '1700000001.000001', thread_ts: '1700000000.000001' },
];
const JIRA_FIXTURE_KEYS = ['PROJ-42'];

function githubGoldenContainerKeys(): string[] {
  const golden = readFileSync(
    new URL('./fixtures/github/backfill-normalized.golden.json', import.meta.url),
    'utf8',
  );
  return [...golden.matchAll(/"sourceContainerId":\s*"([^"]+)"/g)].map((match) => match[1] ?? '');
}

function notionPage(id: string): NotionPage {
  return {
    id,
    created_time: '2026-01-01T00:00:00Z',
    last_edited_time: '2026-01-02T00:00:00Z',
    created_by: { id: 'user-1', object: 'user' },
    last_edited_by: { id: 'user-2', object: 'user' },
    parent: { type: 'workspace', workspace: true },
    properties: { title: { title: [{ plain_text: 'Plan' }] } },
  } as NotionPage;
}

function slackMessage(fixture: (typeof SLACK_FIXTURES)[number]): SlackMessage {
  return { type: 'message', user: 'U12345', text: 'hello', ...fixture } as SlackMessage;
}

describe('connector container keys and the link allowlist', () => {
  it('admits every GitHub fixture container key', () => {
    const keys = githubGoldenContainerKeys();
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) expect(isCanonicalLinkKey(key)).toBe(true);
  });

  it('admits every Jira fixture container key', () => {
    for (const key of JIRA_FIXTURE_KEYS) {
      expect(isCanonicalLinkKey(jiraIssueContainerId({ key } as JiraIssue))).toBe(true);
    }
  });

  it('keeps Linear keys byte-identical and admitted', () => {
    for (const { team, issueNumber } of LINEAR_FIXTURES) {
      const key = linearIssueContainerId(team, issueNumber);
      expect(key).toBe(`${team.key}-${issueNumber}`);
      expect(isCanonicalLinkKey(key)).toBe(true);
    }
  });

  it('keeps Notion keys byte-identical for dashed lower-case ids and admitted', () => {
    for (const id of NOTION_FIXTURE_PAGE_IDS) {
      expect(notionPageContainerId(id)).toBe(`notion:page:${id}`);
      const records = normalizeNotionPageEvent({
        type: 'page.created',
        page: notionPage(id),
        workspace_id: 'ws-1',
      });
      for (const container of records.containers) {
        expect(isCanonicalLinkKey(container.sourceContainerId)).toBe(true);
      }
    }
  });

  it('keeps Slack thread keys byte-identical and admitted', () => {
    for (const fixture of SLACK_FIXTURES) {
      const threadTs = fixture.thread_ts ?? fixture.ts;
      expect(slackThreadId(fixture.channel, threadTs)).toBe(`slack:${fixture.channel}:${threadTs}`);
      const records = normalizeSlackMessage(slackMessage(fixture));
      for (const fact of records.facts) {
        expect(isCanonicalLinkKey(fact.sourceThreadId)).toBe(true);
      }
    }
  });

  it('drops a Notion page whose id is not a page id instead of throwing', () => {
    expect(notionPageContainerId('not-a-page-id')).toBeNull();
    expect(normalizeNotionPageSeed('not-a-page-id')).toEqual({ containers: [], facts: [] });
    expect(
      normalizeNotionPageEvent({
        type: 'page.created',
        page: notionPage('page-1'),
        workspace_id: 'ws-1',
      }),
    ).toEqual({ containers: [], facts: [] });
  });
});

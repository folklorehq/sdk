// SPDX-License-Identifier: Apache-2.0
import { githubManifest } from './kinds/github.js';
import { slackManifest } from './kinds/slack.js';
import { notionManifest } from './kinds/notion.js';
import { linearManifest } from './kinds/linear.js';
import { jiraManifest } from './kinds/jira.js';
import { intercomManifest } from './kinds/intercom.js';
import { meetingManifest } from './kinds/meeting.js';

export const PUBLIC_CONNECTOR_MANIFESTS = [
  githubManifest,
  slackManifest,
  notionManifest,
  linearManifest,
  jiraManifest,
  intercomManifest,
  meetingManifest,
] as const;

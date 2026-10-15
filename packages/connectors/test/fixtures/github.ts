// SPDX-License-Identifier: Apache-2.0
import type { GitHubPullRequest, GitHubRepo } from '../../src/github/types.js';

export const repo: GitHubRepo = { id: 42, full_name: 'acme/widget', private: true };

export const pr: GitHubPullRequest = {
  id: 1001,
  number: 7,
  title: 'Add connectors',
  body: 'Implements the framework. See #3 and https://example.com/spec',
  state: 'open',
  user: { id: 5, login: 'nate', name: 'Nate A' },
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
};

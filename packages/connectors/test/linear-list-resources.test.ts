// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ExternalServiceError } from '@folklore/errors';
import { PinoLogger } from '@folklore/logger';
import { LinearRequestError } from '../src/linear/client.js';
import { LinearConnector } from '../src/linear/LinearConnector.js';
import { normalizeLinearPulledIssue } from '../src/linear/normalize.js';
import { FakeLinearApi } from './doubles/linear/FakeLinearApi.js';
import { issueNode } from './fixtures/linear.js';

function connectorFor(fake: FakeLinearApi): LinearConnector {
  return new LinearConnector({ logger: new PinoLogger({ level: 'silent' }) }, fake);
}

describe('LinearConnector.listResources', () => {
  it('returns every team across pages with its name and privacy', async () => {
    const fake = new FakeLinearApi(2);
    fake.teamNodes = [
      { id: 'team-1', name: 'Engineering', private: false },
      { id: 'team-2', name: 'Security', private: true },
      { id: 'team-3', name: 'Design', private: false },
    ];

    await expect(connectorFor(fake).listResources()).resolves.toEqual([
      { externalId: 'team-1', resourceType: 'team', isPublic: true, displayName: 'Engineering' },
      { externalId: 'team-2', resourceType: 'team', isPublic: false, displayName: 'Security' },
      { externalId: 'team-3', resourceType: 'team', isPublic: true, displayName: 'Design' },
    ]);
  });

  it('uses the id the issue containers carry as resourceExternalId', async () => {
    const issue = issueNode({});
    const records = normalizeLinearPulledIssue(issue, [], { emitAfterMs: 0, floorMs: 0 });
    const fake = new FakeLinearApi();
    fake.teamNodes = [{ id: issue.team.id, name: 'Eng', private: false }];

    const [resource] = await connectorFor(fake).listResources();

    expect(records.containers[0]?.resourceExternalId).toBe(resource?.externalId);
  });

  it('maps a client failure to an ExternalServiceError', async () => {
    const fake = new FakeLinearApi();
    fake.teamsFailure = new LinearRequestError('linear_graphql_error');

    await expect(connectorFor(fake).listResources()).rejects.toBeInstanceOf(ExternalServiceError);
  });
});

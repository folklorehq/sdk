// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { ExternalServiceError } from '@folklore/errors';
import { PinoLogger } from '@folklore/logger';
import { LinearRequestError } from '../src/linear/client.js';
import { LinearConnector } from '../src/linear/LinearConnector.js';
import { LinearGraphqlClient, type LinearRawTransport } from '../src/linear/LinearGraphqlClient.js';
import { LINEAR_TEAMS_QUERY } from '../src/linear/queries.js';
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

describe('LinearGraphqlClient.teams', () => {
  it('sends the teams document with the cursor and unwraps the connection', async () => {
    const data = { teams: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } };
    const rawRequest = vi.fn(async () => ({ data, headers: new Headers(), status: 200 }));
    const client = new LinearGraphqlClient({ rawRequest } as unknown as LinearRawTransport);

    const result = await client.teams('c1');

    expect(rawRequest).toHaveBeenCalledWith(LINEAR_TEAMS_QUERY, { after: 'c1' });
    expect(result.nodes).toEqual([]);
  });
});

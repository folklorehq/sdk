// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JiraHttpClient } from '../src/jira/JiraHttpClient.js';
import { resolveAtlassianCloudId } from '../src/atlassian/resolve-cloud-id.js';

const accessibleResource = { id: 'cloud-123', url: 'https://example.atlassian.net' };

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('resolveAtlassianCloudId', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns a configured site without contacting Atlassian', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(resolveAtlassianCloudId('token', 'configured-cloud', 'jira')).resolves.toBe(
      'configured-cloud',
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves a single accessible site for either provider', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([accessibleResource]));

    await expect(resolveAtlassianCloudId('token', undefined, 'jira')).resolves.toBe('cloud-123');
    await expect(resolveAtlassianCloudId('token', undefined, 'confluence')).resolves.toBe(
      'cloud-123',
    );
  });

  it('rejects an empty site list with the provider-specific error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response([]));

    await expect(resolveAtlassianCloudId('token', undefined, 'confluence')).rejects.toThrow(
      'confluence: no accessible Atlassian site for this token',
    );
  });

  it('rejects an ambiguous site list instead of guessing', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      response([accessibleResource, { id: 'cloud-456', url: 'https://other.atlassian.net' }]),
    );

    await expect(resolveAtlassianCloudId('token', undefined, 'jira')).rejects.toThrow(
      'jira: token grants 2 sites; a cloudId must be configured to disambiguate',
    );
  });

  it('preserves the accessible-resources status and provider label', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response({}, 401));

    await expect(resolveAtlassianCloudId('token', undefined, 'jira')).rejects.toMatchObject({
      message: 'jira accessible-resources failed: 401',
      status: 401,
    });
  });
});

describe('Atlassian clients', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the shared Jira site resolution without changing the Jira REST path', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response([accessibleResource]))
      .mockResolvedValueOnce(response({ values: [], isLast: true }));

    await expect(new JiraHttpClient('token').listProjects()).resolves.toEqual([]);

    expect(fetchSpy.mock.calls[1]?.[0]).toBe(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/project/search?startAt=0&maxResults=50',
    );
  });
});

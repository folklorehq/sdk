// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mintInstallationToken } from '../src/github/installation-auth.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mintInstallationToken', () => {
  it('exchanges the App private key + installation id for a short-lived token', async () => {
    const requestedUrls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        requestedUrls.push(url.toString());
        return Response.json(
          {
            token: 'ghs_installationtoken',
            expires_at: '2026-07-09T13:00:00Z',
            permissions: { contents: 'read' },
          },
          { status: 201 },
        );
      }),
    );

    const minted = await mintInstallationToken({ appId: '123456', privateKey }, '78901234');

    expect(minted.token).toBe('ghs_installationtoken');
    expect(minted.expiresAt).toBe('2026-07-09T13:00:00Z');
    expect(requestedUrls.some((u) => u.includes('/app/installations/78901234/access_tokens'))).toBe(
      true,
    );
  });
});

// SPDX-License-Identifier: Apache-2.0
import { createAppAuth } from '@octokit/auth-app';

export interface GitHubAppCredentials {
  appId: string;
  privateKey: string;
}

export interface InstallationToken {
  token: string;
  expiresAt: string;
}

// Installation tokens expire after ~1h, so mint on demand and never persist (ADL #42).
export async function mintInstallationToken(
  credentials: GitHubAppCredentials,
  installationId: string,
): Promise<InstallationToken> {
  const auth = createAppAuth({
    appId: credentials.appId,
    privateKey: credentials.privateKey,
  });
  const { token, expiresAt } = await auth({
    type: 'installation',
    installationId: Number(installationId),
  });
  return { token, expiresAt };
}

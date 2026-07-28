// SPDX-License-Identifier: Apache-2.0
import { createAppAuth } from '@octokit/auth-app';
// Installation tokens expire after ~1h, so mint on demand and never persist (ADL #42).
export async function mintInstallationToken(credentials, installationId) {
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
//# sourceMappingURL=installation-auth.js.map
// SPDX-License-Identifier: Apache-2.0
import { verifyAttestationManifest } from '../attestation/verify.js';
export function runVerifyAttestation(options) {
    const { manifest, warnings } = verifyAttestationManifest({
        attestationPath: options.attestationPath,
        expectedCommit: options.commit,
        eifPath: options.eifPath,
    });
    for (const warning of warnings) {
        process.stderr.write(`warning: ${warning}\n`);
    }
    process.stdout.write(`attestation ok — pcr0 ${manifest.pcr0.slice(0, 12)}… commit ${manifest.commit ?? 'n/a'}\n`);
}
//# sourceMappingURL=verify-attestation.js.map
// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { AttestationManifestSchema, type AttestationManifest } from './schema.js';
import { isDebugPcr0, isValidPcr0Hex, normalizePcr0 } from './pcr0.js';

export interface VerifyAttestationOptions {
  attestationPath: string;
  expectedCommit?: string;
  eifPath?: string;
}

export interface VerifyAttestationResult {
  manifest: AttestationManifest;
  warnings: string[];
}

export function loadAttestationManifest(path: string): AttestationManifest {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  return AttestationManifestSchema.parse(raw);
}

export function verifyAttestationManifest(
  options: VerifyAttestationOptions,
): VerifyAttestationResult {
  const manifest = loadAttestationManifest(options.attestationPath);
  const warnings: string[] = [];

  if (!isValidPcr0Hex(manifest.pcr0)) {
    throw new Error('attestation pcr0 is not 96 hex characters');
  }

  if (isDebugPcr0(manifest.pcr0)) {
    warnings.push('pcr0 is all zeros — debug build, attestation gate not enforced');
  }

  if (options.expectedCommit && manifest.commit && manifest.commit !== options.expectedCommit) {
    throw new Error('attestation commit does not match expected value');
  }

  if (options.eifPath) {
    const measured = readPcr0FromEif(options.eifPath);
    if (normalizePcr0(measured) !== normalizePcr0(manifest.pcr0)) {
      throw new Error('EIF PCR0 does not match attestation.json pcr0');
    }
  }

  return { manifest, warnings };
}

function readPcr0FromEif(eifPath: string): string {
  try {
    const output = execFileSync('nitro-cli', ['describe-eif', '--eif-path', eifPath], {
      encoding: 'utf8',
    });
    const parsed = JSON.parse(output) as { Measurements?: { PCR0?: string } };
    const pcr0 = parsed.Measurements?.PCR0;
    if (!pcr0) {
      throw new Error('nitro-cli output missing Measurements.PCR0');
    }
    return pcr0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to read EIF measurements: ${message}`);
  }
}

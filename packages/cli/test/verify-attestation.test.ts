// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PCR0_DEBUG } from '../src/attestation/pcr0.js';
import { loadAttestationManifest, verifyAttestationManifest } from '../src/attestation/verify.js';

const SAMPLE_PCR0 = 'a'.repeat(96);

describe('verify-attestation', () => {
  it('loads and validates attestation.json shape', () => {
    const dir = mkdtempSync(join(tmpdir(), 'folklore-attest-'));
    const path = join(dir, 'attestation.json');
    writeFileSync(
      path,
      JSON.stringify({
        commit: 'abc123',
        built_at: '2026-01-01T00:00:00Z',
        eif_sha256: 'b'.repeat(64),
        pcr0: SAMPLE_PCR0,
        pcr1: SAMPLE_PCR0,
        pcr2: SAMPLE_PCR0,
      }),
    );

    const manifest = loadAttestationManifest(path);
    expect(manifest.commit).toBe('abc123');

    const result = verifyAttestationManifest({ attestationPath: path, expectedCommit: 'abc123' });
    expect(result.warnings).toHaveLength(0);
  });

  it('warns on debug pcr0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'folklore-attest-'));
    const path = join(dir, 'attestation.json');
    writeFileSync(path, JSON.stringify({ pcr0: PCR0_DEBUG }));

    const result = verifyAttestationManifest({ attestationPath: path });
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

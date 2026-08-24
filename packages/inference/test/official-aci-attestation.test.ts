// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  dispatchAciProtocol,
  parseOfficialAciReport,
  summarizeOfficialAciReport,
  type LegacyAciAttestation,
} from '../src/official-aci-attestation.js';

const REPORT_PATH = fileURLToPath(new URL('./fixtures/official-aci/report.bin', import.meta.url));

function officialReport(): Record<string, unknown> {
  return JSON.parse(readFileSync(REPORT_PATH, 'utf8')) as Record<string, unknown>;
}

function legacyAttestation(): LegacyAciAttestation {
  return {
    workload_id: 'wl-123',
    workload_keyset_digest: 'd'.repeat(64),
    channel_key_digest: 'e'.repeat(64),
    quote_root_digest: '1'.repeat(64),
    workload_measurement: '2'.repeat(96),
    receipt_keyset_digest: 'f'.repeat(64),
    policy_generation: 1,
    route: '/v1',
    signer_key_id: 'attestation-key-1',
    signature: 'A'.repeat(86) + '==',
  };
}

describe('official ACI attestation projection', () => {
  it('parses the official nested report with the official schema', () => {
    const report = parseOfficialAciReport(officialReport());

    expect(report.api_version).toBe('aci/1');
    expect(report.workload_keyset_digest).toBe(
      'sha256:53a5cd44b30dcc51999754c719f2628a041f174ecbf9662a6f8e898a10cd9371',
    );
  });

  it('returns only bounded content-free attestation metadata', () => {
    const report = officialReport();
    const attestation = report.attestation as Record<string, unknown>;
    const sourceProvenance = attestation.source_provenance as Record<string, unknown>;
    sourceProvenance.operator_extension = { body: 'provider content' };

    expect(summarizeOfficialAciReport(report)).toEqual({
      apiVersion: 'aci/1',
      workloadKeysetDigest:
        'sha256:53a5cd44b30dcc51999754c719f2628a041f174ecbf9662a6f8e898a10cd9371',
      teeType: 'tdx',
      keysetExpiresAt: 1_800_000_000,
      sourceRevision: 'f9706ad89220b5d033e38a6a9f1d94121bf37488',
      imageDigest: null,
    });
  });

  it('rejects an invalid official workload keyset digest', () => {
    expect(() =>
      parseOfficialAciReport({ ...officialReport(), workload_keyset_digest: 'bad' }),
    ).toThrow();
  });
});

describe('ACI protocol dispatch', () => {
  it.each([
    [
      'missing discriminator with official attestation',
      { attestation: {} },
      'protocol_discriminator_absent',
    ],
    [
      'missing discriminator with service capabilities',
      { service_capabilities: {} },
      'protocol_discriminator_absent',
    ],
    [
      'missing discriminator with workload keyset digest',
      { workload_keyset_digest: 'sha256:' + 'a'.repeat(64) },
      'protocol_discriminator_absent',
    ],
    ['null discriminator', { api_version: null }, 'protocol_discriminator_non_string'],
    ['numeric discriminator', { api_version: 1 }, 'protocol_discriminator_non_string'],
    ['object discriminator', { api_version: {} }, 'protocol_discriminator_non_string'],
    ['array discriminator', { api_version: [] }, 'protocol_discriminator_non_string'],
    ['unknown v1 discriminator', { api_version: 'v1' }, 'protocol_discriminator_unknown'],
    ['unknown aci2 discriminator', { api_version: 'aci/2' }, 'protocol_discriminator_unknown'],
    ['empty discriminator', { api_version: '' }, 'protocol_discriminator_unknown'],
    [
      'explicit official discriminator with malformed shape',
      { api_version: 'aci/1' },
      'official_aci_1_invalid',
    ],
    [
      'explicit official discriminator with legacy fields',
      { api_version: 'aci/1', workload_id: 'wl-123' },
      'protocol_discriminator_conflicting',
    ],
    [
      'official and legacy fields without a discriminator',
      { attestation: {}, workload_id: 'wl-123' },
      'protocol_discriminator_conflicting',
    ],
    [
      'incompatible nested protocol markers',
      { api_version: 'aci/1', protocol: 'legacy-v1' },
      'protocol_discriminator_conflicting',
    ],
  ])('%s', (_label, input, code) => {
    const legacyParser = vi.fn(() => legacyAttestation());
    const result = dispatchAciProtocol(input, legacyParser);

    expect(result).toEqual({ protocol: 'error', code });
    expect(legacyParser).not.toHaveBeenCalled();
  });

  it('selects the official parser for an exact official ACI/1 report', () => {
    const legacyParser = vi.fn(() => legacyAttestation());
    const result = dispatchAciProtocol(officialReport(), legacyParser);

    expect(result.protocol).toBe('official-aci/1');
    expect(legacyParser).not.toHaveBeenCalled();
  });

  it('rejects a workload keyset marker without a discriminator without calling the legacy parser', () => {
    const legacyParser = vi.fn(() => legacyAttestation());

    expect(
      dispatchAciProtocol({ workload_keyset_digest: 'sha256:' + 'a'.repeat(64) }, legacyParser),
    ).toEqual({ protocol: 'error', code: 'protocol_discriminator_absent' });
    expect(legacyParser).not.toHaveBeenCalled();
  });

  it('selects the legacy parser only for the complete flat legacy V1 shape', () => {
    const legacy = legacyAttestation();
    const legacyParser = vi.fn(() => legacy);

    expect(dispatchAciProtocol(legacy, legacyParser)).toEqual({
      protocol: 'legacy-v1',
      body: legacy,
    });
    expect(legacyParser).toHaveBeenCalledOnce();
  });

  it('rejects official workload keyset markers mixed with legacy fields without calling legacy parser', () => {
    const legacyParser = vi.fn(() => legacyAttestation());

    expect(
      dispatchAciProtocol(
        {
          workload_keyset_digest: 'sha256:' + 'a'.repeat(64),
          workload_id: 'wl-123',
        },
        legacyParser,
      ),
    ).toEqual({ protocol: 'error', code: 'protocol_discriminator_conflicting' });
    expect(legacyParser).not.toHaveBeenCalled();
  });

  it('does not call the legacy parser for malformed explicit official input', () => {
    const legacyParser = vi.fn(() => legacyAttestation());

    expect(dispatchAciProtocol({ api_version: 'aci/1', attestation: {} }, legacyParser)).toEqual({
      protocol: 'error',
      code: 'official_aci_1_invalid',
    });
    expect(legacyParser).not.toHaveBeenCalled();
  });
});

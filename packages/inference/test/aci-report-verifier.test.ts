// SPDX-License-Identifier: Apache-2.0
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import type { InferenceTrustPolicyV2 } from '@folklore/contracts';
import { canonicalJson as jcsCanonicalJson } from '@folklore/utils';
import { describe, expect, it, vi } from 'vitest';
import { ACI_POLICY_FIXTURE, ACI_REPORT_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciReportVerifier } from '../src/aci/AciReportVerifier.js';
import { AciNativeEvidenceVerifier } from '../src/aci/AciNativeEvidenceVerifier.js';
import type {
  AciEvidenceVerificationInput,
  AciEvidenceVerifierPort,
  AciReportVerifierConfig,
  VerifiedAciEvidenceBindings,
} from '../src/ports.js';

const NOW = 1_750_000_000;
const NONCE = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
const SECOND_NONCE = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 255 - index));
const SOURCE_REVISION = ACI_REPORT_FIXTURE.attestation.source_provenance.repo_commit;
const COMPOSE_DIGEST = `sha256:${'c'.repeat(64)}`;
const QUOTE_ROOT_DIGEST = 'a'.repeat(64);
const KMS_ROOT_DIGEST = 'd'.repeat(64);
const MEASUREMENT = 'b'.repeat(96);
const APP_IDENTITY = 'app:inference';
const RUNTIME_IDENTITY = 'runtime:inference';
const PINNED_VECTOR_NOW = 1_799_999_000;
const PINNED_WORKLOAD_ID =
  'sha256:57c2c8fa98bcf11441f1eff9ef087db67a5560a026082e96903e15365677b8c0';
const PINNED_KEYSET_DIGEST =
  'sha256:f2fba7e1b1451e0c0231df624f293407692ef939d3e0e55bca723131bea3f1ff';
const PINNED_REPORT_DATA = '0b8cc28d7e989a88b1e969af20aa2b224afdc2c99f24c97c31a4af330c964ecf';
const PINNED_ED25519_ENDORSEMENT =
  '64e0a4f5d7af28dfdacc102d14c13470b4ddbd90708e190fc0e787f07b36f20eda0ef1f42ea96b8a7f290eb64a918574dc914ce06b6ea023d2153275f06fd201';
const IDENTITY_PRIVATE_KEY = createPrivateKey({
  key: Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    Buffer.from('01'.repeat(32), 'hex'),
  ]),
  format: 'der',
  type: 'pkcs8',
});
const SECP256K1_KEY_PAIR = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });

function secp256k1PublicKey(publicKey: KeyObject, compressed: boolean): string {
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('secp256k1_public_key_missing_coordinates');
  }
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const lastYByte = y.at(-1);
  if (x.length !== 32 || y.length !== 32 || lastYByte === undefined) {
    throw new Error('secp256k1_public_key_invalid_coordinates');
  }
  if (!compressed) return Buffer.concat([Buffer.from([0x04]), x, y]).toString('hex');
  return Buffer.concat([Buffer.from([lastYByte % 2 === 0 ? 0x02 : 0x03]), x]).toString('hex');
}

interface ReportOptions {
  nonce?: Uint8Array;
  fetchedAt?: number;
  staleAfter?: number;
  notAfter?: number;
  evidence?: Record<string, unknown>;
  identity?: {
    algorithm: 'ed25519' | 'ecdsa-secp256k1';
    privateKey: KeyObject;
    publicKey: string;
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function prefixedDigest(value: string | Uint8Array): string {
  return `sha256:${sha256Hex(value)}`;
}

function keysetDigest(keyset: Record<string, unknown>): string {
  return prefixedDigest(canonicalJson(keyset));
}

function workloadId(keyset: Record<string, unknown>): string {
  const identity = keyset.workload_identity as Record<string, unknown>;
  return prefixedDigest(canonicalJson(identity.public_key));
}

function channelKeyDigest(keyset: Record<string, unknown>): string {
  return prefixedDigest(
    canonicalJson({
      e2ee_public_keys: keyset.e2ee_public_keys,
      tls_public_keys: keyset.tls_public_keys,
    }),
  );
}

function reportData(nonce: Uint8Array, id: string, digest: string): string {
  return sha256Hex(
    canonicalJson({
      purpose: 'aci.report_data.v1',
      workload_id: id,
      workload_keyset_digest: digest,
      nonce: Buffer.from(nonce).toString('hex'),
    }),
  );
}

function publicEvidence(channelDigest: string): Record<string, unknown> {
  return {
    app_identity: APP_IDENTITY,
    channel_key_digest: channelDigest,
    compose_digest: COMPOSE_DIGEST,
    image_digest: null,
    kms_root_digest: KMS_ROOT_DIGEST,
    measurements: [MEASUREMENT],
    quote_root_digest: QUOTE_ROOT_DIGEST,
    rtmrs: [MEASUREMENT],
    runtime_identity: RUNTIME_IDENTITY,
    source_revision: SOURCE_REVISION,
    tcb_status: 'up_to_date',
  };
}

function reportFor(options: ReportOptions = {}): Record<string, unknown> {
  const nonce = options.nonce ?? NONCE;
  const fetchedAt = options.fetchedAt ?? NOW - 30;
  const identity =
    options.identity ??
    ({
      algorithm: 'ed25519',
      privateKey: IDENTITY_PRIVATE_KEY,
      publicKey:
        ACI_REPORT_FIXTURE.attestation.workload_keyset.workload_identity.public_key.public_key,
    } satisfies ReportOptions['identity']);
  const keyset = {
    ...ACI_REPORT_FIXTURE.attestation.workload_keyset,
    keyset_epoch: {
      ...ACI_REPORT_FIXTURE.attestation.workload_keyset.keyset_epoch,
      not_after: options.notAfter ?? NOW + 3_600,
    },
    workload_identity: {
      ...ACI_REPORT_FIXTURE.attestation.workload_keyset.workload_identity,
      public_key: {
        algo: identity.algorithm,
        public_key: identity.publicKey,
      },
    },
  };
  const digest = keysetDigest(keyset);
  const id = workloadId(keyset);
  const endorsementPayload = canonicalJson({
    purpose: 'aci.keyset.endorsement.v1',
    workload_keyset_digest: digest,
  });
  return {
    ...ACI_REPORT_FIXTURE,
    workload_id: id,
    workload_keyset_digest: digest,
    attestation: {
      ...ACI_REPORT_FIXTURE.attestation,
      workload_keyset: keyset,
      report_data: reportData(nonce, id, digest),
      keyset_endorsement: {
        algo: identity.algorithm,
        value: sign(
          identity.algorithm === 'ed25519' ? null : 'sha256',
          Buffer.from(endorsementPayload),
          identity.algorithm === 'ed25519'
            ? identity.privateKey
            : { dsaEncoding: 'ieee-p1363', key: identity.privateKey },
        ).toString('hex'),
      },
      freshness: {
        fetched_at: fetchedAt,
        stale_after: options.staleAfter ?? NOW + 600,
      },
      evidence: options.evidence ?? publicEvidence(channelKeyDigest(keyset)),
    },
  };
}

function nativeBindings(
  report: Record<string, unknown>,
  nonce: Uint8Array,
): VerifiedAciEvidenceBindings {
  const attestation = report.attestation as Record<string, unknown>;
  const evidence = attestation.evidence as Record<string, unknown>;
  const evidenceBytes = new TextEncoder().encode(canonicalJson(evidence));
  return {
    workloadId: String(report.workload_id),
    nonce: Buffer.from(nonce).toString('hex'),
    reportDataStatementDigest: String(attestation.report_data),
    workloadKeysetDigest: String(report.workload_keyset_digest),
    channelKeyDigest: String(evidence.channel_key_digest),
    teeType: String(attestation.tee_type) as 'tdx' | 'sev_snp',
    runtimeIdentity: String(evidence.runtime_identity),
    appIdentity: String(evidence.app_identity),
    composeDigest: evidence.compose_digest === null ? null : String(evidence.compose_digest),
    imageDigest: evidence.image_digest === null ? null : String(evidence.image_digest),
    kmsRootDigest: String(evidence.kms_root_digest),
    quoteRootDigest: String(evidence.quote_root_digest),
    measurements: [...(evidence.measurements as string[])],
    rtmrs: [...(evidence.rtmrs as string[])],
    tcbStatus: String(evidence.tcb_status),
    sourceRevision: String(evidence.source_revision),
    evidenceTranscriptDigest: prefixedDigest(evidenceBytes),
  };
}

function fetchReport(report: Record<string, unknown>): typeof fetch {
  return vi.fn(async () => {
    const response = new Response(JSON.stringify(report), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
    Object.defineProperty(response, 'url', {
      value: 'https://inference.phala.com/v1/aci/attestation',
    });
    return response;
  }) as unknown as typeof fetch;
}

function fetchReportBytes(bytes: Uint8Array): typeof fetch {
  return vi.fn(async () => {
    const response = new Response(bytes, {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
    Object.defineProperty(response, 'url', {
      value: 'https://inference.phala.com/v1/aci/attestation',
    });
    return response;
  }) as unknown as typeof fetch;
}

function verifierFor(
  report: Record<string, unknown> = reportFor(),
  bindings: VerifiedAciEvidenceBindings = nativeBindings(report, NONCE),
  overrides: Partial<AciReportVerifierConfig> = {},
): AciReportVerifier {
  return new AciReportVerifier({
    baseUrl: 'https://inference.phala.com',
    policy: ACI_POLICY_FIXTURE,
    fetchImpl: fetchReport(report),
    nonceSource: () => NONCE,
    clock: () => NOW,
    evidenceVerifier: { verify: vi.fn(async () => bindings) },
    ...overrides,
  });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    code,
    message: `ACI verification failed: ${code}`,
    name: 'AciVerificationError',
  });
}

describe('AciReportVerifier', () => {
  // Source: spec/test-vectors.md at ed312b94c97d1efd1d4db6a8a166196dbd46c861, sha256 deab05b8f256ed259c2c5388cb730862b580f0c357d08d23174625f201134755.
  it('matches the pinned upstream workload, keyset, report-data, and Ed25519 vectors', async () => {
    const keyset = structuredClone(ACI_REPORT_FIXTURE.attestation.workload_keyset);
    expect(prefixedDigest(jcsCanonicalJson(keyset.workload_identity.public_key))).toBe(
      PINNED_WORKLOAD_ID,
    );
    expect(prefixedDigest(jcsCanonicalJson(keyset))).toBe(PINNED_KEYSET_DIGEST);
    expect(
      sha256Hex(
        jcsCanonicalJson({
          nonce: 'test-nonce',
          purpose: 'aci.report_data.v1',
          workload_id: PINNED_WORKLOAD_ID,
          workload_keyset_digest: PINNED_KEYSET_DIGEST,
        }),
      ),
    ).toBe(PINNED_REPORT_DATA);

    const report = structuredClone(ACI_REPORT_FIXTURE) as unknown as Record<string, unknown>;
    const attestation = report.attestation as Record<string, unknown>;
    attestation.keyset_endorsement = {
      algo: 'ed25519',
      value: PINNED_ED25519_ENDORSEMENT,
    };
    attestation.report_data = reportData(NONCE, PINNED_WORKLOAD_ID, PINNED_KEYSET_DIGEST);
    attestation.freshness = {
      fetched_at: PINNED_VECTOR_NOW - 30,
      stale_after: PINNED_VECTOR_NOW + 600,
    };
    attestation.evidence = publicEvidence(channelKeyDigest(keyset));

    const verified = await verifierFor(report, nativeBindings(report, NONCE), {
      clock: () => PINNED_VECTOR_NOW,
    }).verify();

    expect(verified.workloadId).toBe(PINNED_WORKLOAD_ID);
    expect(verified.workloadKeysetDigest).toBe(PINNED_KEYSET_DIGEST);
  });

  it.each([
    { compressed: true, label: 'compressed' },
    { compressed: false, label: 'uncompressed' },
  ])(
    'verifies a secp256k1 workload endorsement with a $label public point',
    async ({ compressed }) => {
      const report = reportFor({
        identity: {
          algorithm: 'ecdsa-secp256k1',
          privateKey: SECP256K1_KEY_PAIR.privateKey,
          publicKey: secp256k1PublicKey(SECP256K1_KEY_PAIR.publicKey, compressed),
        },
      });

      await expect(verifierFor(report).verify()).resolves.toMatchObject({
        workloadId: report.workload_id,
        workloadKeysetDigest: report.workload_keyset_digest,
      });
    },
  );

  it('rejects a secp256k1 endorsement whose compressed public point is invalid', async () => {
    const report = reportFor({
      identity: {
        algorithm: 'ecdsa-secp256k1',
        privateKey: SECP256K1_KEY_PAIR.privateKey,
        publicKey: `02${'00'.repeat(32)}`,
      },
    });

    await expectCode(verifierFor(report).verify(), 'endorsement_invalid');
  });

  it('publishes a deeply immutable verified keyset', async () => {
    const report = reportFor();
    const keyset = await verifierFor(report).verify();

    expect(keyset.workloadId).toBe(report.workload_id);
    expect(keyset.workloadKeysetDigest).toBe(report.workload_keyset_digest);
    expect(keyset.version).toBe(
      ACI_REPORT_FIXTURE.attestation.workload_keyset.keyset_epoch.version,
    );
    expect(keyset.notAfter).toBe(NOW + 3_600);
    expect(keyset.receiptSigningKeys[0]).toMatchObject({ keyId: 'receipt-1' });
    expect(keyset.e2eePublicKeys[0]).toMatchObject({ keyId: 'e2ee-1' });
    expect(keyset.tlsPublicKeys[0]).toEqual({
      domain: 'api.example.com',
      spkiSha256: 'c0'.repeat(32),
    });
    expect(keyset.channelPins).toContainEqual({
      algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
      domain: 'inference.phala.com',
      keyId: 'e2ee-1',
      type: 'e2ee_public_key_sha256',
      value: sha256Hex(Buffer.from('ab'.repeat(32), 'hex')),
    });
    expect(keyset.channelKeyDigest).toBe(
      channelKeyDigest(
        (report.attestation as Record<string, unknown>).workload_keyset as Record<string, unknown>,
      ),
    );
    expect(Object.isFrozen(keyset)).toBe(true);
    expect(Object.isFrozen(keyset.receiptSigningKeys)).toBe(true);
    expect(Object.isFrozen(keyset.receiptSigningKeys[0])).toBe(true);
    expect(Object.isFrozen(keyset.e2eePublicKeys)).toBe(true);
    expect(Object.isFrozen(keyset.tlsPublicKeys)).toBe(true);
    expect(Object.isFrozen(keyset.channelPins)).toBe(true);
    expect(JSON.stringify(keyset)).not.toContain(MEASUREMENT);
  });

  it('uses a fresh 32-byte nonce, a pinned redirect-free fetch, and public-only native input', async () => {
    const suppliedNonces = [NONCE, SECOND_NONCE];
    const requestedNonces: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const nonceHex = url.searchParams.get('nonce');
      if (nonceHex === null) throw new Error('missing nonce');
      requestedNonces.push(nonceHex);
      expect(`${url.origin}${url.pathname}`).toBe('https://inference.phala.com/v1/aci/attestation');
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer fetch-only-secret',
      );
      const response = Response.json(reportFor({ nonce: Buffer.from(nonceHex, 'hex') }));
      Object.defineProperty(response, 'url', {
        value: 'https://inference.phala.com/v1/aci/attestation',
      });
      return response;
    }) as unknown as typeof fetch;
    const nativeInputs: AciEvidenceVerificationInput[] = [];
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(async (input) => {
        nativeInputs.push(input);
        const report = JSON.parse(new TextDecoder().decode(input.reportBytes)) as Record<
          string,
          unknown
        >;
        const attestation = report.attestation as Record<string, unknown>;
        expect(new TextDecoder().decode(input.evidenceBytes)).toBe(
          canonicalJson(attestation.evidence),
        );
        expect(Object.keys(input).sort()).toEqual([
          'deadline',
          'evidenceBytes',
          'nonce',
          'policyAnchors',
          'reportBytes',
          'signal',
        ]);
        expect(Object.keys(input.policyAnchors).sort()).toEqual([
          'channelPolicy',
          'evidence',
          'origin',
          'permittedClaimSources',
          'requiredSessionClaims',
          'route',
          'sourceProvenance',
        ]);
        expect(JSON.stringify(input)).not.toContain('fetch-only-secret');
        return nativeBindings(report, input.nonce);
      }),
    };
    const verifier = new AciReportVerifier({
      apiKey: 'fetch-only-secret',
      baseUrl: 'https://inference.phala.com/v1',
      clock: () => NOW,
      evidenceVerifier,
      fetchImpl,
      nonceSource: () => {
        const nonce = suppliedNonces.shift();
        if (nonce === undefined) throw new Error('nonce source exhausted');
        return nonce;
      },
      policy: ACI_POLICY_FIXTURE,
    });

    await verifier.verify();
    await verifier.verify();

    expect(requestedNonces).toEqual([
      Buffer.from(NONCE).toString('hex'),
      Buffer.from(SECOND_NONCE).toString('hex'),
    ]);
    expect(nativeInputs).toHaveLength(2);
  });

  it('rejects a report response whose final origin differs from the pinned origin', async () => {
    const fetchImpl = vi.fn(async () => {
      const response = new Response(JSON.stringify(reportFor()), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
      Object.defineProperty(response, 'url', { value: 'https://evil.example/v1/aci/attestation' });
      return response;
    }) as unknown as typeof fetch;

    await expectCode(
      verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), { fetchImpl }).verify(),
      'report_fetch_failed',
    );
  });

  it('rejects a report response with no final URL', async () => {
    const fetchImpl = vi.fn(async () => Response.json(reportFor())) as unknown as typeof fetch;

    await expectCode(
      verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), { fetchImpl }).verify(),
      'report_fetch_failed',
    );
  });

  it('accepts official profile-defined evidence without flattened profile claims', async () => {
    const report = reportFor({
      evidence: {
        app_compose: {},
        downstream_tls_binding: {},
        event_log: '[]',
        key_custody: {},
        quote: '00',
        quote_report_data: '00',
        vm_config: {},
      },
    });
    const bindings: VerifiedAciEvidenceBindings = {
      ...nativeBindings(reportFor(), NONCE),
      workloadId: report.workload_id as string,
      workloadKeysetDigest: report.workload_keyset_digest as string,
      reportDataStatementDigest: (report.attestation as Record<string, unknown>)
        .report_data as string,
      sourceRevision: (
        (report.attestation as Record<string, unknown>).source_provenance as Record<string, unknown>
      ).repo_commit as string,
      imageDigest: (
        (report.attestation as Record<string, unknown>).source_provenance as Record<string, unknown>
      ).image_digest as string | null,
      channelKeyDigest: channelKeyDigest(
        report.attestation.workload_keyset as Record<string, unknown>,
      ),
      evidenceTranscriptDigest: prefixedDigest(
        new TextEncoder().encode(
          canonicalJson((report.attestation as Record<string, unknown>).evidence),
        ),
      ),
    };

    await expect(verifierFor(report, bindings).verify()).resolves.toMatchObject({
      workloadId: report.workload_id,
      workloadKeysetDigest: report.workload_keyset_digest,
    });
  });

  it('rejects non-integer nested evidence before native verification', async () => {
    const base = reportFor();
    const baseAttestation = base.attestation as Record<string, unknown>;
    const report = reportFor({
      evidence: {
        ...(baseAttestation.evidence as Record<string, unknown>),
        nested: { value: 1.5, detail: 'SENSITIVE_EVIDENCE_DETAIL' },
      },
    });
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };
    const promise = verifierFor(report, nativeBindings(report, NONCE), {
      evidenceVerifier,
    }).verify();

    await expectCode(promise, 'report_malformed');
    await expect(promise).rejects.not.toThrow(/SENSITIVE_EVIDENCE_DETAIL/);
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects oversized evidence node count before native verification', async () => {
    const base = reportFor();
    const baseAttestation = base.attestation as Record<string, unknown>;
    const report = reportFor({
      evidence: {
        ...(baseAttestation.evidence as Record<string, unknown>),
        oversized: Array.from({ length: 4_097 }, () => null),
      },
    });
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), { evidenceVerifier }).verify(),
      'report_malformed',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects malformed UTF-8 before recomputation or native verification', async () => {
    const report = reportFor();
    const bytes = Buffer.from(JSON.stringify(report));
    const vendorOffset = bytes.indexOf(Buffer.from('example-provider'));
    if (vendorOffset < 0) throw new Error('test report vendor missing');
    bytes[vendorOffset] = 0xff;
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), {
        evidenceVerifier,
        fetchImpl: fetchReportBytes(bytes),
      }).verify(),
      'report_malformed',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it.each([
    ['literal', '"api_version":"aci/0","api_version":"aci/1"'],
    ['escaped alias', '"api_version":"aci/0","api_\\u0076ersion":"aci/1"'],
  ])('rejects %s duplicate JSON object keys before native verification', async (_kind, fields) => {
    const report = reportFor();
    const text = JSON.stringify(report).replace('"api_version":"aci/1"', fields);
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), {
        evidenceVerifier,
        fetchImpl: fetchReportBytes(new TextEncoder().encode(text)),
      }).verify(),
      'report_malformed',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects non-integer JSON numbers outside the evidence object', async () => {
    const report = reportFor();
    const text = JSON.stringify(report).replace(
      '"supported_e2ee_versions":["2"]',
      '"supported_e2ee_versions":["2"],"extension_number":1.5',
    );
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), {
        evidenceVerifier,
        fetchImpl: fetchReportBytes(new TextEncoder().encode(text)),
      }).verify(),
      'report_malformed',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects an escaped unpaired Unicode surrogate before native verification', async () => {
    const report = reportFor();
    const text = JSON.stringify(report).replace('example-provider', 'example-\\ud800-provider');
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), {
        evidenceVerifier,
        fetchImpl: fetchReportBytes(new TextEncoder().encode(text)),
      }).verify(),
      'report_malformed',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a nonce that is not exactly 32 bytes before fetching', async () => {
    const fetchImpl = fetchReport(reportFor());
    const verifier = verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), {
      fetchImpl,
      nonceSource: () => new Uint8Array(31),
    });

    await expectCode(verifier.verify(), 'nonce_must_be_32_bytes');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an endpoint that is not exactly pinned to the policy origin', () => {
    expect(
      () =>
        new AciReportVerifier({
          baseUrl: 'https://redirect.example.com/v1',
          policy: ACI_POLICY_FIXTURE,
          fetchImpl: fetchReport(reportFor()),
          evidenceVerifier: { verify: vi.fn(async () => nativeBindings(reportFor(), NONCE)) },
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'origin_mismatch',
        message: 'ACI verification failed: origin_mismatch',
      }),
    );
  });

  it('rejects a recomputed keyset digest mismatch before native verification', async () => {
    const report = {
      ...reportFor(),
      workload_keyset_digest: `sha256:${'0'.repeat(64)}`,
    };
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), { evidenceVerifier }).verify(),
      'workload_keyset_digest_mismatch',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a recomputed workload identity mismatch before native verification', async () => {
    const report = { ...reportFor(), workload_id: `sha256:${'0'.repeat(64)}` };
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), { evidenceVerifier }).verify(),
      'workload_id_mismatch',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a recomputed report-data statement mismatch before native verification', async () => {
    const report = reportFor();
    const attestation = report.attestation as Record<string, unknown>;
    const changed = {
      ...report,
      attestation: { ...attestation, report_data: '0'.repeat(64) },
    };
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(changed, NONCE)) };

    await expectCode(
      verifierFor(changed, nativeBindings(changed, NONCE), { evidenceVerifier }).verify(),
      'report_data_mismatch',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('rejects a keyset whose identity endorsement is invalid', async () => {
    const report = reportFor();
    const attestation = report.attestation as Record<string, unknown>;
    const endorsement = attestation.keyset_endorsement as Record<string, unknown>;
    const changed = {
      ...report,
      attestation: {
        ...attestation,
        keyset_endorsement: { ...endorsement, value: '0'.repeat(128) },
      },
    };

    await expectCode(
      verifierFor(changed, nativeBindings(changed, NONCE)).verify(),
      'endorsement_invalid',
    );
  });

  it.each([
    ['report_expired', { staleAfter: NOW }],
    ['report_from_future', { fetchedAt: NOW + 61, staleAfter: NOW + 120 }],
    ['keyset_expired', { notAfter: NOW }],
    [
      'keyset_lifetime_exceeded',
      { fetchedAt: NOW - 30, notAfter: NOW - 30 + ACI_POLICY_FIXTURE.maxKeysetLifetimeSeconds + 1 },
    ],
    ['freshness_exceeds_keyset', { notAfter: NOW + 300, staleAfter: NOW + 301 }],
  ])('rejects invalid freshness or lifetime with %s', async (code, options) => {
    const report = reportFor(options);
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), { evidenceVerifier }).verify(),
      code,
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('maps native rejection to a content-free error', async () => {
    const report = reportFor();
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(async () => {
        throw new Error('SENSITIVE_NATIVE_DETAIL');
      }),
    };

    const promise = verifierFor(report, nativeBindings(report, NONCE), {
      evidenceVerifier,
    }).verify();
    await expectCode(promise, 'native_verification_failed');
    await expect(promise).rejects.not.toThrow(/SENSITIVE_NATIVE_DETAIL/);
  });

  it('rejects a malformed or boolean-like native result', async () => {
    const report = reportFor();
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(async () => true as never),
    };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), { evidenceVerifier }).verify(),
      'native_result_malformed',
    );
  });

  it('aborts native verification at its deadline', async () => {
    const report = reportFor();
    let signal: AbortSignal | undefined;
    let deadline: number | undefined;
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(
        (input) =>
          new Promise<VerifiedAciEvidenceBindings>((_resolve, reject) => {
            signal = input.signal;
            deadline = input.deadline;
            input.signal.addEventListener('abort', () => reject(input.signal.reason), {
              once: true,
            });
          }),
      ),
    };

    const startedAt = Date.now();

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), {
        evidenceVerifier,
        nativeVerifierTimeoutMs: 5,
      }).verify(),
      'native_verifier_timeout',
    );
    expect(signal?.aborted).toBe(true);
    expect(deadline).toBeGreaterThanOrEqual(startedAt + 5);
  });

  it('does not publish a late native result after timeout', async () => {
    const report = reportFor();
    let signal: AbortSignal | undefined;
    let resolveNative: ((value: VerifiedAciEvidenceBindings) => void) | undefined;
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(
        (input) =>
          new Promise<VerifiedAciEvidenceBindings>((resolve) => {
            signal = input.signal;
            resolveNative = resolve;
          }),
      ),
    };
    const verification = verifierFor(report, nativeBindings(report, NONCE), {
      evidenceVerifier,
      nativeVerifierTimeoutMs: 5,
    }).verify();
    let didPublish = false;
    void verification.then(
      () => {
        didPublish = true;
      },
      () => undefined,
    );

    await expectCode(verification, 'native_verifier_timeout');
    expect(signal?.aborted).toBe(true);
    resolveNative?.(nativeBindings(report, NONCE));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(didPublish).toBe(false);
  });

  it('rejects a native result that completes at the deadline before the timer runs', async () => {
    const report = reportFor();
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(100).mockReturnValueOnce(100).mockReturnValue(105);
    let signal: AbortSignal | undefined;
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn((input) => {
        signal = input.signal;
        return Promise.resolve(nativeBindings(report, NONCE));
      }),
    };

    try {
      await expectCode(
        verifierFor(report, nativeBindings(report, NONCE), {
          evidenceVerifier,
          nativeVerifierTimeoutMs: 5,
        }).verify(),
        'native_verifier_timeout',
      );
      expect(signal?.aborted).toBe(true);
    } finally {
      now.mockRestore();
    }
  });

  const nativeBindingMismatches: ReadonlyArray<
    readonly [
      keyof VerifiedAciEvidenceBindings,
      VerifiedAciEvidenceBindings[keyof VerifiedAciEvidenceBindings],
    ]
  > = [
    ['workloadId', `sha256:${'1'.repeat(64)}`],
    ['nonce', 'ff'.repeat(32)],
    ['reportDataStatementDigest', '1'.repeat(64)],
    ['workloadKeysetDigest', `sha256:${'1'.repeat(64)}`],
    ['channelKeyDigest', `sha256:${'1'.repeat(64)}`],
    ['teeType', 'sev_snp'],
    ['runtimeIdentity', 'runtime:other'],
    ['appIdentity', 'app:other'],
    ['composeDigest', `sha256:${'1'.repeat(64)}`],
    ['imageDigest', `sha256:${'1'.repeat(64)}`],
    ['kmsRootDigest', '1'.repeat(64)],
    ['quoteRootDigest', '1'.repeat(64)],
    ['measurements', ['1'.repeat(96)]],
    ['rtmrs', ['1'.repeat(96)]],
    ['tcbStatus', 'out_of_date'],
    ['sourceRevision', '1'.repeat(40)],
    ['evidenceTranscriptDigest', `sha256:${'1'.repeat(64)}`],
  ];

  it.each(nativeBindingMismatches)('rejects a native %s binding mismatch', async (field, value) => {
    const report = reportFor();
    const bindings = {
      ...nativeBindings(report, NONCE),
      [field]: value,
    } as VerifiedAciEvidenceBindings;

    const independentlyBoundFields: ReadonlySet<keyof VerifiedAciEvidenceBindings> = new Set([
      'workloadId',
      'nonce',
      'reportDataStatementDigest',
      'workloadKeysetDigest',
      'channelKeyDigest',
      'teeType',
      'imageDigest',
      'sourceRevision',
      'evidenceTranscriptDigest',
    ]);
    await expectCode(
      verifierFor(report, bindings).verify(),
      independentlyBoundFields.has(field) ? 'native_binding_mismatch' : 'native_policy_mismatch',
    );
  });

  it('rejects native evidence that matches the report but is outside signed policy', async () => {
    const base = reportFor();
    const attestation = base.attestation as Record<string, unknown>;
    const evidence = {
      ...(attestation.evidence as Record<string, unknown>),
      app_identity: 'app:untrusted',
    };
    const report = reportFor({ evidence });

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE)).verify(),
      'native_policy_mismatch',
    );
  });

  it('enforces separate runtime identity and RTMR policy anchors', async () => {
    const rtmr = 'e'.repeat(96);
    const policy = {
      ...ACI_POLICY_FIXTURE,
      evidence: {
        ...ACI_POLICY_FIXTURE.evidence,
        runtimeMeasurements: [MEASUREMENT, rtmr],
        runtimeRtmrs: [MEASUREMENT],
        runtimeIdentities: [RUNTIME_IDENTITY],
      },
    } as unknown as InferenceTrustPolicyV2;
    const report = reportFor();
    const actual = {
      ...nativeBindings(report, NONCE),
      runtimeIdentity: 'runtime:untrusted',
      rtmrs: [rtmr],
    };
    const verifier = new AciNativeEvidenceVerifier(
      { verify: vi.fn(async () => actual) },
      policy,
      100,
    );

    await expect(
      verifier.verify(
        {
          reportBytes: new Uint8Array(),
          evidenceBytes: new Uint8Array(),
          nonce: NONCE,
          policyAnchors: ACI_POLICY_FIXTURE,
        },
        actual,
      ),
    ).rejects.toMatchObject({ code: 'native_policy_mismatch' });
  });

  it('bounds the report body before parsing', async () => {
    const fetchImpl = vi.fn(async () => {
      const response = new Response('x'.repeat(257), {
        headers: { 'Content-Type': 'application/json', 'Content-Length': '257' },
      });
      Object.defineProperty(response, 'url', {
        value: 'https://inference.phala.com/v1/aci/attestation',
      });
      return response;
    }) as unknown as typeof fetch;

    await expectCode(
      verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), {
        fetchImpl,
        maxReportBytes: 256,
      }).verify(),
      'report_too_large',
    );
  });

  it('bounds a fetch implementation that ignores abort signals', async () => {
    const fetchImpl = vi.fn(
      () => new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch;

    await expectCode(
      verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), {
        fetchImpl,
        fetchTimeoutMs: 5,
      }).verify(),
      'report_timeout',
    );
  });

  it('maps malformed report details to a content-free error', async () => {
    const sentinel = 'SENSITIVE_REPORT_DETAIL';
    const fetchImpl = vi.fn(async () => {
      const response = Response.json({ sentinel });
      Object.defineProperty(response, 'url', {
        value: 'https://inference.phala.com/v1/aci/attestation',
      });
      return response;
    }) as unknown as typeof fetch;
    const promise = verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), {
      fetchImpl,
    }).verify();

    await expectCode(promise, 'report_malformed');
    await expect(promise).rejects.not.toThrow(new RegExp(sentinel));
  });
});

// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
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
  AciTrustContext,
  TrustedTimeReadContext,
  VerifiedAciEvidenceBindings,
} from '../src/ports.js';
import { InMemoryAciKeysetHighWaterAuthority } from './doubles/aci/InMemoryAciStores.js';

const NOW = 1_750_000_000;
const TRUST_CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'a'.repeat(64),
};
const NONCE = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
const SECOND_NONCE = Uint8Array.from(Array.from({ length: 32 }, (_, index) => 255 - index));
const REPORT_URL = 'https://inference.phala.com/v1/aci/attestation';
const SOURCE_REVISION = ACI_REPORT_FIXTURE.attestation.source_provenance.repo_commit;
const COMPOSE_DIGEST = `sha256:${'c'.repeat(64)}`;
const QUOTE_ROOT_DIGEST = 'a'.repeat(64);
const KMS_ROOT_DIGEST = 'd'.repeat(64);
const MEASUREMENT = 'b'.repeat(96);
const APP_IDENTITY = 'app:inference';
const RUNTIME_IDENTITY = 'runtime:inference';
const PINNED_KEYSET_DIGEST =
  'sha256:53a5cd44b30dcc51999754c719f2628a041f174ecbf9662a6f8e898a10cd9371';
const PINNED_REPORT_DATA = 'df2174d28130852b413646a3786927b93e94c11d770268b65def8bdba45cb49e';
const ACTIVATION_GENERATION = 17;

type JsonObject = Record<string, unknown>;

interface ReportOptions {
  nonce?: Uint8Array;
  notAfter?: number;
  evidence?: JsonObject;
  sourceProvenance?: JsonObject | null;
  keyset?: JsonObject;
}

function jsonObject(value: unknown): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('test_value_is_not_an_object');
  }
  return value as JsonObject;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function prefixedDigest(value: string | Uint8Array): string {
  return `sha256:${sha256Hex(value)}`;
}

function keysetDigest(keyset: JsonObject): string {
  return prefixedDigest(jcsCanonicalJson(keyset));
}

function reportData(nonce: Uint8Array, digest: string): string {
  return sha256Hex(
    jcsCanonicalJson({
      keyset_digest: digest,
      nonce: Buffer.from(nonce).toString('hex'),
      purpose: 'aci.report_data.v1',
    }),
  );
}

function publicEvidence(channelDigest: string): JsonObject {
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

function channelKeyDigest(keyset: JsonObject): string {
  return prefixedDigest(
    jcsCanonicalJson({
      e2ee_public_keys: keyset.e2ee_public_keys,
      tls_public_keys: keyset.tls_public_keys,
    }),
  );
}

function reportFor(options: ReportOptions = {}): JsonObject {
  const nonce = options.nonce ?? NONCE;
  const keyset = {
    ...structuredClone(ACI_REPORT_FIXTURE.attestation.workload_keyset),
    ...(options.keyset ?? {}),
    not_after: options.notAfter ?? NOW + 3_600,
  } as JsonObject;
  const digest = keysetDigest(keyset);
  const attestation = {
    ...ACI_REPORT_FIXTURE.attestation,
    workload_keyset: keyset,
    report_data: reportData(nonce, digest),
    evidence: options.evidence ?? publicEvidence(channelKeyDigest(keyset)),
    ...(options.sourceProvenance === undefined
      ? {}
      : { source_provenance: options.sourceProvenance }),
  };
  return {
    ...ACI_REPORT_FIXTURE,
    workload_keyset_digest: digest,
    attestation,
  };
}

function nativeBindings(report: JsonObject, nonce: Uint8Array): VerifiedAciEvidenceBindings {
  const attestation = jsonObject(report.attestation);
  const evidence = jsonObject(attestation.evidence);
  const workloadKeysetDigest = String(report.workload_keyset_digest);
  const imageDigest = evidence.image_digest;
  return {
    workloadId: workloadKeysetDigest,
    nonce: Buffer.from(nonce).toString('hex'),
    reportDataStatementDigest: String(attestation.report_data),
    workloadKeysetDigest,
    channelKeyDigest: String(evidence.channel_key_digest),
    teeType: String(attestation.tee_type) as 'tdx' | 'sev_snp',
    runtimeIdentity: String(evidence.runtime_identity),
    appIdentity: String(evidence.app_identity),
    composeDigest: evidence.compose_digest === null ? null : String(evidence.compose_digest),
    imageDigest: imageDigest === null ? null : String(imageDigest),
    kmsRootDigest: String(evidence.kms_root_digest),
    quoteRootDigest: String(evidence.quote_root_digest),
    measurements: [...(evidence.measurements as string[])],
    rtmrs: [...(evidence.rtmrs as string[])],
    tcbStatus: String(evidence.tcb_status),
    sourceRevision: SOURCE_REVISION,
    evidenceTranscriptDigest: prefixedDigest(new TextEncoder().encode(jcsCanonicalJson(evidence))),
  };
}

function responseForBytes(bytes: Uint8Array): Response {
  const response = new Response(bytes, {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
  Object.defineProperty(response, 'url', { value: REPORT_URL });
  return response;
}

function fetchReport(report: JsonObject): typeof fetch {
  return vi.fn(async () =>
    responseForBytes(new TextEncoder().encode(JSON.stringify(report))),
  ) as unknown as typeof fetch;
}

function fetchReportBytes(bytes: Uint8Array): typeof fetch {
  return vi.fn(async () => responseForBytes(bytes)) as unknown as typeof fetch;
}

function verifierFor(
  report: JsonObject = reportFor(),
  bindings: VerifiedAciEvidenceBindings = nativeBindings(report, NONCE),
  overrides: Partial<AciReportVerifierConfig> = {},
): AciReportVerifier {
  return new AciReportVerifier({
    baseUrl: 'https://inference.phala.com',
    policy: ACI_POLICY_FIXTURE,
    fetchImpl: fetchReport(report),
    nonceSource: () => NONCE,
    trustedTimeAuthority: {
      read: async () => ({
        trustedNow: NOW,
        ...TRUST_CONTEXT,
      }),
    },
    trustedTimeContext: TRUST_CONTEXT,
    activationGeneration: ACTIVATION_GENERATION,
    evidenceVerifier: { verify: vi.fn(async () => bindings) },
    keysetHighWaterAuthority: new InMemoryAciKeysetHighWaterAuthority(),
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
  it('fails closed when V2 trusted time is not configured', async () => {
    await expectCode(
      verifierFor(undefined, undefined, { trustedTimeAuthority: undefined }).verify(),
      'clock_invalid',
    );
  });

  it('passes the configured context to every security trusted-time read', async () => {
    const contexts: TrustedTimeReadContext[] = [];
    const verified = await verifierFor(undefined, undefined, {
      trustedTimeAuthority: {
        read: async (context) => {
          contexts.push(context ?? {});
          return { trustedNow: NOW, ...TRUST_CONTEXT };
        },
      },
    }).verify();

    expect(verified.workloadId).toBeDefined();
    expect(contexts).toEqual([TRUST_CONTEXT, TRUST_CONTEXT]);
  });

  it('matches the pinned official keyset digest and report-data construction', async () => {
    const officialKeyset = structuredClone(
      ACI_REPORT_FIXTURE.attestation.workload_keyset,
    ) as JsonObject;
    const officialReport = ACI_REPORT_FIXTURE as unknown as JsonObject;
    const officialAttestation = jsonObject(officialReport.attestation);
    expect(keysetDigest(officialKeyset)).toBe(PINNED_KEYSET_DIGEST);
    expect(officialReport.workload_keyset_digest).toBe(PINNED_KEYSET_DIGEST);
    expect(officialAttestation.report_data).toBe(PINNED_REPORT_DATA);
    expect('workload_id' in officialReport).toBe(false);
    expect('vendor' in officialAttestation).toBe(false);
    expect('freshness' in officialAttestation).toBe(false);
    expect('keyset_endorsement' in officialAttestation).toBe(false);
    expect('workload_identity' in officialKeyset).toBe(false);
    expect('keyset_epoch' in officialKeyset).toBe(false);

    const report = reportFor({ notAfter: 1_800_000_000 });
    const expectedReportData = reportData(NONCE, PINNED_KEYSET_DIGEST);
    expect(jsonObject(report.attestation).report_data).toBe(expectedReportData);
    await expect(verifierFor(report).verify()).resolves.toMatchObject({
      workloadId: PINNED_KEYSET_DIGEST,
      workloadKeysetDigest: PINNED_KEYSET_DIGEST,
    });
  });

  it('rejects non-ASCII member names in the official report artifact', async () => {
    const base = reportFor();
    const report = reportFor({
      evidence: {
        ...publicEvidence(
          channelKeyDigest(jsonObject(jsonObject(base.attestation).workload_keyset)),
        ),
        ['é']: 'not-an-official-member',
      },
    });
    const reportBytes = new TextEncoder().encode(JSON.stringify(report));
    const bindings = nativeBindings(report, NONCE);
    await expectCode(
      verifierFor(report, bindings, { fetchImpl: fetchReportBytes(reportBytes) }).verify(),
      'report_malformed',
    );
  });

  it('publishes a deeply immutable verified keyset with a durable authority version', async () => {
    const report = reportFor();
    const keyset = await verifierFor(report).verify();

    expect(keyset.workloadId).toBe(report.workload_keyset_digest);
    expect(keyset.workloadKeysetDigest).toBe(report.workload_keyset_digest);
    expect(keyset.version).toBe(1);
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
      value: sha256Hex(
        Buffer.from('5dfedd3b6bd47f6fa28ee15d969d5bb0ea53774d488bdaf9df1c6e0124b3ef22', 'hex'),
      ),
    });
    expect(keyset.channelKeyDigest).toBe(
      channelKeyDigest(jsonObject(jsonObject(report.attestation).workload_keyset)),
    );
    expect(Object.isFrozen(keyset)).toBe(true);
    expect(Object.isFrozen(keyset.receiptSigningKeys)).toBe(true);
    expect(Object.isFrozen(keyset.receiptSigningKeys[0])).toBe(true);
    expect(Object.isFrozen(keyset.e2eePublicKeys)).toBe(true);
    expect(Object.isFrozen(keyset.tlsPublicKeys)).toBe(true);
    expect(Object.isFrozen(keyset.channelPins)).toBe(true);
    expect(JSON.stringify(keyset)).not.toContain(MEASUREMENT);
  });

  it('admits keysets with the deployment activation generation instead of zero', async () => {
    const report = reportFor();
    const admitKeyset = vi.fn(async () => 9);
    const authority = {
      read: vi.fn(async () => undefined),
      admitKeyset,
    };

    await verifierFor(report, nativeBindings(report, NONCE), {
      keysetHighWaterAuthority: authority,
      activationGeneration: ACTIVATION_GENERATION,
    }).verify();

    expect(admitKeyset).toHaveBeenCalledWith({
      context: TRUST_CONTEXT,
      keysetDigest: String(report.workload_keyset_digest),
      policyGeneration: ACI_POLICY_FIXTURE.generation,
      activationGeneration: ACTIVATION_GENERATION,
    });
  });

  it('uses a fresh 32-byte nonce, a pinned redirect-free fetch, and public-only native input', async () => {
    const suppliedNonces = [NONCE, SECOND_NONCE];
    const requestedNonces: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      const nonceHex = url.searchParams.get('nonce');
      if (nonceHex === null) throw new Error('missing_nonce');
      requestedNonces.push(nonceHex);
      expect(`${url.origin}${url.pathname}`).toBe(REPORT_URL);
      expect(init?.method).toBe('GET');
      expect(init?.redirect).toBe('error');
      expect((init?.headers as Record<string, string>).Authorization).toBe(
        'Bearer fetch-only-secret',
      );
      const report = reportFor({ nonce: Uint8Array.from(Buffer.from(nonceHex, 'hex')) });
      return responseForBytes(new TextEncoder().encode(JSON.stringify(report)));
    }) as unknown as typeof fetch;
    const nativeInputs: AciEvidenceVerificationInput[] = [];
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(async (input) => {
        nativeInputs.push(input);
        const report = JSON.parse(new TextDecoder().decode(input.reportBytes)) as JsonObject;
        const attestation = jsonObject(report.attestation);
        expect(new TextDecoder().decode(input.evidenceBytes)).toBe(
          jcsCanonicalJson(attestation.evidence),
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
      trustedTimeAuthority: {
        read: async () => ({
          trustedNow: NOW,
          ...TRUST_CONTEXT,
        }),
      },
      trustedTimeContext: TRUST_CONTEXT,
      activationGeneration: ACTIVATION_GENERATION,
      evidenceVerifier,
      keysetHighWaterAuthority: new InMemoryAciKeysetHighWaterAuthority(),
      fetchImpl,
      nonceSource: () => {
        const nonce = suppliedNonces.shift();
        if (nonce === undefined) throw new Error('nonce_source_exhausted');
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
      const response = responseForBytes(new TextEncoder().encode(JSON.stringify(reportFor())));
      Object.defineProperty(response, 'url', { value: 'https://evil.example/v1/aci/attestation' });
      return response;
    }) as unknown as typeof fetch;

    await expectCode(
      verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), { fetchImpl }).verify(),
      'report_fetch_failed',
    );
  });

  it('rejects a report response with no final URL', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify(reportFor()), { status: 200 }),
    ) as unknown as typeof fetch;

    await expectCode(
      verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), { fetchImpl }).verify(),
      'report_fetch_failed',
    );
  });

  it('accepts official profile-defined evidence without flattened profile claims', async () => {
    const base = reportFor();
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
    const evidence = jsonObject(jsonObject(report.attestation).evidence);
    const bindings = {
      ...nativeBindings(base, NONCE),
      workloadId: String(report.workload_keyset_digest),
      workloadKeysetDigest: String(report.workload_keyset_digest),
      reportDataStatementDigest: String(jsonObject(report.attestation).report_data),
      channelKeyDigest: channelKeyDigest(
        jsonObject(jsonObject(report.attestation).workload_keyset),
      ),
      evidenceTranscriptDigest: prefixedDigest(
        new TextEncoder().encode(jcsCanonicalJson(evidence)),
      ),
    };

    await expect(verifierFor(report, bindings).verify()).resolves.toMatchObject({
      workloadId: report.workload_keyset_digest,
      workloadKeysetDigest: report.workload_keyset_digest,
    });
  });

  it('rejects non-integer nested evidence before native verification', async () => {
    const base = reportFor();
    const baseEvidence = jsonObject(jsonObject(base.attestation).evidence);
    const report = reportFor({
      evidence: {
        ...baseEvidence,
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
    const baseEvidence = jsonObject(jsonObject(base.attestation).evidence);
    const report = reportFor({
      evidence: {
        ...baseEvidence,
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
    const sourceOffset = bytes.indexOf(Buffer.from('private-ai-gateway'));
    if (sourceOffset < 0) throw new Error('test_source_missing');
    bytes[sourceOffset] = 0xff;
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
    const text = JSON.stringify(report).replace('private-ai-gateway', 'private-\\ud800-gateway');
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
          activationGeneration: ACTIVATION_GENERATION,
          fetchImpl: fetchReport(reportFor()),
          evidenceVerifier: { verify: vi.fn(async () => nativeBindings(reportFor(), NONCE)) },
          trustedTimeAuthority: {
            read: async () => ({ trustedNow: NOW, ...TRUST_CONTEXT }),
          },
          trustedTimeContext: TRUST_CONTEXT,
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

  it('rejects a recomputed official report-data statement mismatch before native verification', async () => {
    const report = reportFor();
    const attestation = jsonObject(report.attestation);
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

  it('rejects removed official workload, vendor, freshness, endorsement, epoch, and identity fields', async () => {
    const report = reportFor();
    const attestation = jsonObject(report.attestation);
    const keyset = jsonObject(attestation.workload_keyset);
    const variants: JsonObject[] = [
      { ...report, workload_id: `sha256:${'0'.repeat(64)}` },
      { ...report, attestation: { ...attestation, vendor: 'provider' } },
      { ...report, attestation: { ...attestation, freshness: {} } },
      { ...report, attestation: { ...attestation, keyset_endorsement: {} } },
      {
        ...report,
        attestation: {
          ...attestation,
          workload_keyset: { ...keyset, workload_id: `sha256:${'0'.repeat(64)}` },
        },
      },
      {
        ...report,
        attestation: {
          ...attestation,
          workload_keyset: { ...keyset, keyset_epoch: {} },
        },
      },
      {
        ...report,
        attestation: {
          ...attestation,
          workload_keyset: { ...keyset, workload_identity: {} },
        },
      },
    ];

    for (const changed of variants) {
      const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };
      await expectCode(
        verifierFor(changed, nativeBindings(report, NONCE), { evidenceVerifier }).verify(),
        'report_malformed',
      );
      expect(evidenceVerifier.verify).not.toHaveBeenCalled();
    }
  });

  it('rejects a keyset that is expired at trusted time', async () => {
    const report = reportFor({ notAfter: NOW });
    const evidenceVerifier = { verify: vi.fn(async () => nativeBindings(report, NONCE)) };

    await expectCode(
      verifierFor(report, nativeBindings(report, NONCE), { evidenceVerifier }).verify(),
      'keyset_expired',
    );
    expect(evidenceVerifier.verify).not.toHaveBeenCalled();
  });

  it('uses durable authority version instead of provider not_after for the local high-water', async () => {
    const report = reportFor({ notAfter: NOW + 100 });
    const verified = await verifierFor(report, nativeBindings(report, NONCE), {
      trustedTimeAuthority: { read: async () => ({ trustedNow: NOW + 17, ...TRUST_CONTEXT }) },
    }).verify();

    expect(verified.notAfter).toBe(NOW + 100);
    expect(verified.version).toBe(1);
    expect(verified.version).not.toBe(verified.notAfter);
  });

  it('re-verifies the same digest deterministically at one trusted checkpoint', async () => {
    const report = reportFor();

    const first = await verifierFor(report).verify();
    const afterRestart = await verifierFor(report).verify();

    expect(afterRestart.workloadKeysetDigest).toBe(first.workloadKeysetDigest);
    expect(afterRestart.version).toBe(first.version);
  });

  it('publishes a rotated official digest at the same trusted observation', async () => {
    const rotatedKeyset = {
      ...structuredClone(ACI_REPORT_FIXTURE.attestation.workload_keyset),
      receipt_signing_keys: [
        {
          ...ACI_REPORT_FIXTURE.attestation.workload_keyset.receipt_signing_keys[0],
          public_key: '6'.repeat(64),
        },
      ],
    } as JsonObject;
    const first = await verifierFor(reportFor()).verify();
    const rotated = await verifierFor(reportFor({ keyset: rotatedKeyset })).verify();

    expect(rotated.workloadKeysetDigest).not.toBe(first.workloadKeysetDigest);
    expect(rotated.version).toBe(first.version);
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
    let deadline = 0;
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(
        async (input) =>
          new Promise<VerifiedAciEvidenceBindings>((_resolve, reject) => {
            signal = input.signal;
            deadline = input.deadline;
            input.signal.addEventListener('abort', () => reject(input.signal.reason));
          }),
      ),
    };
    const startedAt = performance.now();

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
    const now = vi.spyOn(performance, 'now');
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
    readonly [keyof VerifiedAciEvidenceBindings, unknown]
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
    const attestation = jsonObject(base.attestation);
    const report = reportFor({
      evidence: {
        ...jsonObject(attestation.evidence),
        app_identity: 'app:untrusted',
      },
    });

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
      Object.defineProperty(response, 'url', { value: REPORT_URL });
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
      Object.defineProperty(response, 'url', { value: REPORT_URL });
      return response;
    }) as unknown as typeof fetch;
    const promise = verifierFor(reportFor(), nativeBindings(reportFor(), NONCE), {
      fetchImpl,
    }).verify();

    await expectCode(promise, 'report_malformed');
    await expect(promise).rejects.not.toThrow(new RegExp(sentinel));
  });
});

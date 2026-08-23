// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  aciReceiptSchema,
  aciSessionSchema,
  aciWorkloadReportSchema,
  type AciReceipt,
  type AciSession,
  type AciWorkloadReport,
  type InferenceModelRole,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  ACI_POLICY_FIXTURE,
  ACI_RECEIPT_FIXTURE,
  ACI_REPORT_FIXTURE,
  ACI_SESSION_FIXTURE,
  ACI_SESSION_ID,
} from '../../contracts/test/fixtures/aci-v1.js';
import { OfficialAciExchange } from '../src/aci/OfficialAciExchange.js';
import { AciReceiptVerifier } from '../src/aci/AciReceiptVerifier.js';
import { AciReportBindingVerifier } from '../src/aci/AciReportBindingVerifier.js';
import { AciReportVerifier } from '../src/aci/AciReportVerifier.js';
import { AciSessionVerifier } from '../src/aci/AciSessionVerifier.js';
import type {
  AciEvidenceVerifierPort,
  AciReceiptVerificationInput,
  AciSessionCandidate,
  AciSessionEvidenceVerifierPort,
  AciTrustContext,
  AciTrustHighWater,
  OfficialAciExchangeConfig,
  OfficialAciRequest,
  VerifiedAciEvidenceBindings,
  VerifiedAciKeyset,
  VerifiedAciSessionEvidenceBindings,
  VerifiedAciSessionSet,
  VerifiedAciTrustSnapshot,
} from '../src/ports.js';
import { AciReceiptVerifierDouble } from './doubles/aci/AciReceiptVerifierDouble.js';
import {
  InMemoryAciKeysetHighWaterAuthority,
  InMemoryAciReceiptReplayStore,
} from './doubles/aci/InMemoryAciStores.js';
import { AciTrustStateDouble } from './doubles/aci/AciTrustStateDouble.js';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/official-aci/', import.meta.url));

function fixtureBytes(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURE_DIR, name)));
}

function fixtureText(name: string): string {
  return new TextDecoder().decode(fixtureBytes(name));
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function prefixedDigest(value: string | Uint8Array): string {
  return `sha256:${sha256Hex(value)}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

const FIXTURE_FILES = Object.freeze([
  'request-wire.bin',
  'session.bin',
  'report.bin',
  'receipt.bin',
  'response.bin',
  'exchange-canonical.bin',
]);

// Local provenance members that the provenance layer must never add to an official ACI/1 document.
// Official ACI/1 names such as source_provenance and evidence remain allowed.
const LOCAL_PROVENANCE_MEMBER_NAMES = Object.freeze([
  'admission',
  'activation_generation',
  'capability_digest',
  'high_water',
  'keyset_high_water',
  'lease',
  'model_artifact_digest',
  'model_provenance',
  'model_revision',
  'policy_digest',
  'policy_generation',
  'proof',
  'proof_id',
  'provenance',
  'role_binding',
  'snapshot_digest',
  'tenant_aad_digest',
]);

function assertNoProvenanceMembers(value: unknown, label: string): void {
  const stack: unknown[] = [value];
  const seen = new WeakSet<object>();
  while (stack.length > 0) {
    const item = stack.pop();
    if (item === null || typeof item !== 'object' || seen.has(item)) continue;
    seen.add(item);
    if (Array.isArray(item)) {
      stack.push(...item);
      continue;
    }
    for (const [key, nested] of Object.entries(item)) {
      if (LOCAL_PROVENANCE_MEMBER_NAMES.includes(key)) {
        throw new Error(`provenance member ${key} found in ${label}`);
      }
      stack.push(nested);
    }
  }
}

const TRUST_CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'a'.repeat(64),
};
const NOW = 1_750_000_100;
const ACTIVATION_GENERATION = 11;
const ROLES: readonly InferenceModelRole[] = ['embed', 'generate', 'critique', 'judge'];
const REPORT_NONCE = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
const REPORT_NOW = 1_799_999_000;

function trustedTimeSample(trustedNow: number) {
  return {
    trustedNow,
    checkpointDigest: 'a'.repeat(64),
    bootEpoch: 'boot-1',
    orgId: 'org-1',
    deploymentId: 'deployment-1',
  };
}

function sessionContentId(session: AciSession): string {
  return sha256Hex(canonicalJson(session));
}

function sessionChannelKeyDigest(session: AciSession): string {
  return prefixedDigest(canonicalJson({ channel_binding: session.channel_binding }));
}

function sessionUpstreamIdentityDigest(session: AciSession): string {
  return prefixedDigest(
    canonicalJson({
      upstream_name: session.upstream_name,
      url_origin: session.endpoint ?? null,
      verifier_id: session.verifier_id,
      channel_bindings: session.channel_binding,
      claims: session.claims,
    }),
  );
}

function keysetAuthority(
  policy: InferenceTrustPolicyV2,
  keyset: VerifiedAciKeyset,
): InMemoryAciKeysetHighWaterAuthority {
  return new InMemoryAciKeysetHighWaterAuthority({
    generation: 1,
    policyGeneration: policy.generation,
    activationGeneration: ACTIVATION_GENERATION,
    keysetVersion: keyset.version,
    currentKeysetDigest: keyset.workloadKeysetDigest,
    supersededKeysetDigests: [],
    trustContext: TRUST_CONTEXT,
  } satisfies AciTrustHighWater);
}

describe('official ACI/1 wire fixtures (P0 freeze)', () => {
  it('aciSessionSchema accepts session.bin with an unchanged exact serialized key set', () => {
    const session = aciSessionSchema.parse(JSON.parse(fixtureText('session.bin')));
    expect(sortedKeys(session as unknown as Record<string, unknown>)).toEqual([
      'api_version',
      'channel_binding',
      'claims',
      'endpoint',
      'established_at',
      'evidence',
      'expires_at',
      'identity',
      'upstream_name',
      'verifier_id',
    ]);
    assertNoProvenanceMembers(session, 'session.bin');
  });

  it('aciReceiptSchema accepts receipt.bin with an unchanged exact serialized key set', () => {
    const receipt = aciReceiptSchema.parse(JSON.parse(fixtureText('receipt.bin')));
    expect(sortedKeys(receipt as unknown as Record<string, unknown>)).toEqual([
      'api_version',
      'chat_id',
      'endpoint',
      'event_log',
      'key_id',
      'method',
      'model',
      'receipt_id',
      'served_at',
      'signature',
      'workload_keyset_digest',
    ]);
    assertNoProvenanceMembers(receipt, 'receipt.bin');
  });

  it('aciWorkloadReportSchema accepts report.bin with an unchanged official report shape', () => {
    const report = aciWorkloadReportSchema.parse(JSON.parse(fixtureText('report.bin')));
    expect(sortedKeys(report as unknown as Record<string, unknown>)).toEqual([
      'api_version',
      'attestation',
      'service_capabilities',
      'workload_keyset_digest',
    ]);
    assertNoProvenanceMembers(report, 'report.bin');
  });

  it('AciSessionVerifier consumes session.bin without adding provenance members', async () => {
    const session = aciSessionSchema.parse(JSON.parse(fixtureText('session.bin')));
    const sessionBytes = fixtureBytes('session.bin');
    const channelKeyDigest = prefixedDigest(
      canonicalJson({ channel_binding: session.channel_binding }),
    );
    const policy: InferenceTrustPolicyV2 = {
      ...ACI_POLICY_FIXTURE,
      channelPolicy: {
        acceptedBindings: [{ type: 'tls_spki_sha256', domains: ['upstream.example.com'] }],
      },
      requiredSessionClaims: ['tee_attested'],
    };
    const keyset: VerifiedAciKeyset = {
      workloadId: `sha256:${'1'.repeat(64)}`,
      workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
      version: 1,
      notAfter: NOW + 3_600,
      receiptSigningKeys: [{ keyId: 'receipt-1', algorithm: 'ed25519', publicKey: '3'.repeat(64) }],
      e2eePublicKeys: [
        {
          keyId: 'e2ee-1',
          algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
          publicKey: '4'.repeat(64),
        },
      ],
      tlsPublicKeys: [{ spkiSha256: 'd1'.repeat(32), domain: 'upstream.example.com' }],
      channelPins: [
        { type: 'tls_spki_sha256', value: 'd1'.repeat(32), domain: 'upstream.example.com' },
      ],
      channelKeyDigest: `sha256:${'5'.repeat(64)}`,
    };
    const candidates: AciSessionCandidate[] = ROLES.map((role) => {
      const roleModel = policy.roleModels[role];
      return {
        role,
        model: roleModel.model,
        modelRevision: roleModel.revision,
        sessionId: sessionContentId(session),
        workloadKeysetDigest: keyset.workloadKeysetDigest,
        channelKeyDigest,
        policyGeneration: policy.generation,
        activationGeneration: ACTIVATION_GENERATION,
        session,
        sessionBytes,
      };
    });
    const evidenceVerifier = new SessionEvidenceVerifierDouble();
    const verifier = new AciSessionVerifier({
      policy,
      trustedTimeAuthority: { read: async () => trustedTimeSample(NOW) },
      trustedTimeContext: TRUST_CONTEXT,
      evidenceVerifier,
      keysetHighWaterAuthority: keysetAuthority(policy, keyset),
    });

    const selected = await verifier.verifyAndSelect({
      keyset,
      candidates,
      highWater: {
        minimumPolicyGeneration: policy.generation,
        minimumActivationGeneration: ACTIVATION_GENERATION,
        minimumKeysetVersion: keyset.version,
        supersededKeysetDigests: [],
      },
    });

    for (const role of ROLES) {
      expect(sortedKeys(selected[role] as unknown as Record<string, unknown>)).toEqual([
        'channelKeyDigest',
        'channelPins',
        'establishedAt',
        'expiresAt',
        'model',
        'modelRevision',
        'role',
        'sessionId',
        'upstreamIdentity',
        'upstreamIdentityDigest',
        'workloadKeysetDigest',
      ]);
      expect(selected[role].sessionId).toBe(sessionContentId(session));
    }
    expect(evidenceVerifier.calls).toBe(ROLES.length);
  });

  it('AciReportVerifier and AciReportBindingVerifier consume report.bin without adding provenance members', async () => {
    const reportBytes = fixtureBytes('report.bin');
    const report = aciWorkloadReportSchema.parse(JSON.parse(fixtureText('report.bin')));

    const bindingVerifier = new AciReportBindingVerifier();
    const parsedEvidence = bindingVerifier.parseEvidence(report.attestation.evidence);
    expect(parsedEvidence.evidenceBytes).toEqual(
      new TextEncoder().encode(canonicalJson(report.attestation.evidence)),
    );
    const bindings = bindingVerifier.verify(report, parsedEvidence.evidenceBytes, REPORT_NONCE);
    expect(bindings.workloadId).toBe(report.workload_keyset_digest);
    expect(bindings.workloadKeysetDigest).toBe(report.workload_keyset_digest);
    expect(bindings.teeType).toBe(report.attestation.tee_type);
    expect(bindings.imageDigest).toBe(report.attestation.source_provenance.image_digest);
    expect(bindings.reportDataStatementDigest).toBe(report.attestation.report_data);
    expect(bindings.nonce).toBe(Buffer.from(REPORT_NONCE).toString('hex'));
    expect(bindings.channelKeyDigest).toBe(
      prefixedDigest(
        canonicalJson({
          e2ee_public_keys: report.attestation.workload_keyset.e2ee_public_keys,
          tls_public_keys: report.attestation.workload_keyset.tls_public_keys ?? [],
        }),
      ),
    );
    const sourceRevision = report.attestation.source_provenance.repo_commit;
    if (sourceRevision === null) throw new Error('report fixture must carry a repository commit');
    expect(bindings.sourceRevision).toBe(sourceRevision);

    const fetchImpl = vi.fn(async () => {
      const response = new Response(reportBytes, {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
      Object.defineProperty(response, 'url', {
        value: 'https://inference.phala.com/v1/aci/attestation',
      });
      return response;
    }) as unknown as typeof fetch;
    const evidenceVerifier: AciEvidenceVerifierPort = {
      verify: vi.fn(async (input) => nativeBindings(report, input.nonce)),
    };
    const verifier = new AciReportVerifier({
      baseUrl: 'https://inference.phala.com',
      policy: ACI_POLICY_FIXTURE,
      fetchImpl,
      nonceSource: () => REPORT_NONCE,
      trustedTimeAuthority: { read: async () => trustedTimeSample(REPORT_NOW) },
      trustedTimeContext: TRUST_CONTEXT,
      activationGeneration: ACTIVATION_GENERATION,
      evidenceVerifier,
      keysetHighWaterAuthority: new InMemoryAciKeysetHighWaterAuthority(),
    });

    const keyset = await verifier.verify();
    expect(sortedKeys(keyset as unknown as Record<string, unknown>)).toEqual([
      'channelKeyDigest',
      'channelPins',
      'e2eePublicKeys',
      'notAfter',
      'receiptSigningKeys',
      'tlsPublicKeys',
      'version',
      'workloadId',
      'workloadKeysetDigest',
    ]);
    expect(keyset.workloadId).toBe(report.workload_keyset_digest);
    expect(keyset.workloadKeysetDigest).toBe(report.workload_keyset_digest);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('AciReceiptVerifier consumes receipt.bin without adding provenance members', async () => {
    const receipt = aciReceiptSchema.parse(JSON.parse(fixtureText('receipt.bin')));
    const receiptBytes = fixtureBytes('receipt.bin');
    const requestBytes = new TextEncoder().encode(
      '{"messages":[{"content":"hi","role":"user"}],"model":"demo-model"}',
    );
    const responseBytes = new TextEncoder().encode('{"choices":[],"id":"chatcmpl-123"}');
    const requestReceived = receipt.event_log.find(
      (event): event is Extract<AciReceipt['event_log'][number], { type: 'request.received' }> =>
        event.type === 'request.received',
    );
    const responseReturned = receipt.event_log.find(
      (event): event is Extract<AciReceipt['event_log'][number], { type: 'response.returned' }> =>
        event.type === 'response.returned',
    );
    expect(requestReceived?.body_hash).toBe(prefixedDigest(requestBytes));
    expect(responseReturned?.body_hash).toBe(prefixedDigest(responseBytes));

    const sessionPins: VerifiedAciSessionSet['generate']['channelPins'] = [
      { type: 'tls_spki_sha256', value: 'd1'.repeat(32), domain: 'upstream.example.com' },
    ];
    const upstreamIdentityDigest = prefixedDigest(
      canonicalJson({
        upstream_name: ACI_SESSION_FIXTURE.upstream_name,
        url_origin: ACI_SESSION_FIXTURE.endpoint,
        verifier_id: ACI_SESSION_FIXTURE.verifier_id,
        channel_bindings: ACI_SESSION_FIXTURE.channel_binding,
        claims: ACI_SESSION_FIXTURE.claims,
      }),
    );
    const keyset: VerifiedAciKeyset = {
      workloadId: ACI_RECEIPT_FIXTURE.workload_keyset_digest,
      workloadKeysetDigest: ACI_RECEIPT_FIXTURE.workload_keyset_digest,
      version: ACI_POLICY_FIXTURE.generation,
      notAfter: ACI_REPORT_FIXTURE.attestation.workload_keyset.not_after,
      receiptSigningKeys: ACI_REPORT_FIXTURE.attestation.workload_keyset.receipt_signing_keys.map(
        (key) => ({ keyId: key.key_id, algorithm: key.algo, publicKey: key.public_key }),
      ),
      e2eePublicKeys: ACI_REPORT_FIXTURE.attestation.workload_keyset.e2ee_public_keys.map(
        (key) => ({ keyId: key.key_id, algorithm: key.algo, publicKey: key.public_key }),
      ),
      tlsPublicKeys: ACI_REPORT_FIXTURE.attestation.workload_keyset.tls_public_keys.map((key) => ({
        spkiSha256: key.spki_sha256,
        domain: key.domain,
      })),
      channelPins: [{ type: 'tls_spki_sha256', value: 'c0'.repeat(32), domain: 'api.example.com' }],
      channelKeyDigest: `sha256:${'5'.repeat(64)}`,
    };
    const sessions = Object.fromEntries(
      ROLES.map((role) => [
        role,
        {
          role,
          model: 'demo-model',
          modelRevision: 'revision-1',
          sessionId: ACI_SESSION_ID,
          establishedAt: ACI_SESSION_FIXTURE.established_at,
          expiresAt: ACI_SESSION_FIXTURE.expires_at,
          workloadKeysetDigest: keyset.workloadKeysetDigest,
          channelKeyDigest: `sha256:${'9'.repeat(64)}`,
          channelPins: sessionPins,
          upstreamIdentityDigest,
          upstreamIdentity: {
            upstreamName: ACI_SESSION_FIXTURE.upstream_name,
            urlOrigin: ACI_SESSION_FIXTURE.endpoint,
            verifierId: ACI_SESSION_FIXTURE.verifier_id,
            claims: ACI_SESSION_FIXTURE.claims,
          },
        },
      ]),
    ) as VerifiedAciSessionSet;
    const snapshot: VerifiedAciTrustSnapshot = {
      generation: 1,
      policyGeneration: ACI_POLICY_FIXTURE.generation,
      activationGeneration: 1,
      expiresAt: ACI_SESSION_FIXTURE.expires_at,
      keyset,
      channelPins: keyset.channelPins,
      sessions,
      supersededKeysetDigests: [],
    };
    const fetchImpl = vi.fn(async () => {
      const response = new Response(receiptBytes, { status: 200 });
      Object.defineProperty(response, 'url', {
        value: 'https://inference.phala.com/v1/aci/receipts/rcpt-0001',
      });
      return response;
    }) as unknown as typeof fetch;
    const verifier = new AciReceiptVerifier({
      baseUrl: 'https://inference.phala.com',
      policy: ACI_POLICY_FIXTURE,
      fetchImpl,
      trustedTimeAuthority: { read: async () => trustedTimeSample(NOW) },
      replayStore: new InMemoryAciReceiptReplayStore(),
    });
    const input: AciReceiptVerificationInput = {
      snapshot,
      receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
      requestBytes,
      responseBytes,
      role: 'generate',
      endpoint: '/v1/chat/completions',
      method: 'POST',
      trustedTimeContext: TRUST_CONTEXT,
    };

    const result = await verifier.verify(input);
    expect(result).toEqual({
      outcome: 'served',
      receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
      servedAt: ACI_RECEIPT_FIXTURE.served_at,
      sessionId: ACI_SESSION_ID,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('OfficialAciExchange emits request-wire.bin and accepts response.bin without adding local provenance members', async () => {
    const { exchange, fetchImpl } = setupExchange();
    const wire = await exchange.serialize(REQUEST);

    expect(wire.bytes).toEqual(fixtureBytes('request-wire.bin'));
    expect(wire.byteLength).toBe(fixtureBytes('request-wire.bin').byteLength);
    expect(wire.requestWireSha256).toBe(prefixedDigest(fixtureBytes('request-wire.bin')));

    const decoded = await exchange.execute(REQUEST, (bytes) => new TextDecoder().decode(bytes));
    expect(decoded).toBe(fixtureText('response.bin'));
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(new TextEncoder().encode(init.body as string)).toEqual(fixtureBytes('request-wire.bin'));

    const requestWire = JSON.parse(fixtureText('request-wire.bin')) as Record<string, unknown>;
    expect(sortedKeys(requestWire)).toEqual(['messages', 'model', 'provider']);
    expect(sortedKeys(requestWire.provider as Record<string, unknown>)).toEqual([
      'aci_session_ids',
      'aci_verified',
    ]);
    assertNoProvenanceMembers(requestWire, 'request-wire.bin');
    assertNoProvenanceMembers(JSON.parse(fixtureText('response.bin')), 'response.bin');
  });

  it('the canonical exchange fixture is byte-for-byte stable', () => {
    const requestWire = fixtureBytes('request-wire.bin');
    const response = fixtureBytes('response.bin');
    const canonical = new Uint8Array([...requestWire, ...response]);
    expect(fixtureBytes('exchange-canonical.bin')).toEqual(canonical);
  });

  it('manifest.json pins the SHA-256 digest and length of every official fixture', () => {
    const manifest = JSON.parse(fixtureText('manifest.json')) as {
      schema: string;
      files: Record<string, { sha256: string; byteLength: number }>;
    };
    expect(manifest.schema).toBe('folklore.official-aci-wire-fixtures.v1');
    expect(Object.keys(manifest.files).sort()).toEqual([...FIXTURE_FILES].sort());
    for (const name of FIXTURE_FILES) {
      const bytes = fixtureBytes(name);
      expect(manifest.files[name]).toEqual({
        sha256: sha256Hex(bytes),
        byteLength: bytes.byteLength,
      });
    }
  });

  it('provenance fields are absent from every official request, session, report, receipt, and response fixture', () => {
    for (const name of [
      'request-wire.bin',
      'session.bin',
      'report.bin',
      'receipt.bin',
      'response.bin',
    ]) {
      assertNoProvenanceMembers(JSON.parse(fixtureText(name)), name);
    }
  });
});

function nativeBindings(report: AciWorkloadReport, nonce: Uint8Array): VerifiedAciEvidenceBindings {
  const evidence = report.attestation.evidence;
  const evidenceBytes = new TextEncoder().encode(canonicalJson(evidence));
  return {
    workloadId: report.workload_keyset_digest,
    nonce: Buffer.from(nonce).toString('hex'),
    reportDataStatementDigest: report.attestation.report_data,
    workloadKeysetDigest: report.workload_keyset_digest,
    channelKeyDigest: String(evidence.channel_key_digest),
    teeType: report.attestation.tee_type,
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

class SessionEvidenceVerifierDouble implements AciSessionEvidenceVerifierPort {
  calls = 0;

  async verify(input: Parameters<AciSessionEvidenceVerifierPort['verify']>[0]) {
    this.calls += 1;
    const session = JSON.parse(new TextDecoder().decode(input.sessionBytes)) as AciSession;
    return {
      sessionId: sessionContentId(session),
      claims: session.claims,
      identity: session.identity ?? null,
      channelBindings: session.channel_binding,
      establishedAt: session.established_at,
      expiresAt: session.expires_at,
      channelKeyDigest: sessionChannelKeyDigest(session),
      upstreamIdentityDigest: sessionUpstreamIdentityDigest(session),
    } satisfies VerifiedAciSessionEvidenceBindings;
  }
}

const REQUEST_BODY = { messages: [{ content: 'hi', role: 'user' }], model: 'demo/model' };
const REQUEST: OfficialAciRequest = {
  role: 'generate',
  endpoint: '/v1/chat/completions',
  method: 'POST',
  body: REQUEST_BODY,
};
const EXCHANGE_POLICY: InferenceTrustPolicyV2 = {
  ...ACI_POLICY_FIXTURE,
  permittedModels: [{ model: 'demo/model', revision: 'revision-1' }],
  roleModels: Object.fromEntries(
    ROLES.map((role) => [role, { model: 'demo/model', revision: 'revision-1' }]),
  ) as InferenceTrustPolicyV2['roleModels'],
};

function exchangeSnapshot(): VerifiedAciTrustSnapshot {
  const sessions = Object.fromEntries(
    ROLES.map((role) => [
      role,
      {
        role,
        model: 'demo/model',
        modelRevision: 'revision-1',
        sessionId: '0'.repeat(63) + '1',
        establishedAt: 1_750_000_000,
        expiresAt: 1_750_003_600,
        workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
        channelKeyDigest: `sha256:${'3'.repeat(64)}`,
        channelPins: [
          {
            type: 'tls_spki_sha256' as const,
            value: '4'.repeat(64),
            domain: 'inference.phala.com',
          },
        ],
        upstreamIdentityDigest: `sha256:${'5'.repeat(64)}`,
        upstreamIdentity: {
          upstreamName: 'upstream.example',
          urlOrigin: 'https://inference.phala.com',
          verifierId: 'verifier-1',
          claims: { tee_attested: { status: 'asserted' } },
        },
      },
    ]),
  ) as VerifiedAciSessionSet;
  return {
    trustContext: TRUST_CONTEXT,
    generation: 1,
    policyGeneration: EXCHANGE_POLICY.generation,
    activationGeneration: 1,
    expiresAt: 1_750_003_600,
    keyset: {
      workloadId: `sha256:${'1'.repeat(64)}`,
      workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
      version: 1,
      notAfter: 1_750_003_600,
      receiptSigningKeys: [],
      e2eePublicKeys: [],
      tlsPublicKeys: [],
      channelPins: sessions.generate.channelPins,
      channelKeyDigest: sessions.generate.channelKeyDigest,
    },
    channelPins: sessions.generate.channelPins,
    sessions,
    supersededKeysetDigests: [],
  };
}

function setupExchange(overrides: Partial<OfficialAciExchangeConfig> = {}): {
  exchange: OfficialAciExchange;
  fetchImpl: ReturnType<typeof vi.fn>;
} {
  const fetchImpl = vi.fn(async () => {
    const response = new Response(fixtureBytes('response.bin'), {
      headers: { 'x-receipt-id': 'rcpt-0001' },
    });
    Object.defineProperty(response, 'url', {
      value: 'https://inference.phala.com/v1/chat/completions',
    });
    return response;
  }) as unknown as typeof fetch;
  const configuredFetch = overrides.fetchImpl ?? fetchImpl;
  const channelTransport = {
    open: async (input: { session: VerifiedAciSessionSet['generate'] }) => {
      const observedChannelPin = input.session.channelPins[0];
      if (observedChannelPin === undefined) throw new Error('missing_fixture_pin');
      return {
        channelKeyDigest: input.session.channelKeyDigest,
        observedChannelPin,
        send: async (bytes: Uint8Array) => {
          const result = await configuredFetch(
            new URL('https://inference.phala.com/v1/chat/completions'),
            {
              method: 'POST',
              headers: {
                authorization: 'Bearer secret',
                'content-type': 'application/json',
              },
              body: Buffer.from(bytes),
              redirect: 'error',
            },
          );
          if (new URL(result.url).origin !== EXCHANGE_POLICY.origin) {
            throw new Error('origin_mismatch');
          }
          return {
            receiptId: result.headers.get('x-receipt-id') ?? '',
            responseBytes: new Uint8Array(await result.arrayBuffer()),
            responseOk: result.ok,
          };
        },
        close: async () => undefined,
      };
    },
  };
  return {
    exchange: new OfficialAciExchange({
      baseUrl: EXCHANGE_POLICY.origin,
      policy: EXCHANGE_POLICY,
      trustState: new AciTrustStateDouble(exchangeSnapshot()),
      receiptVerifier: new AciReceiptVerifierDouble(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      channelTransport,
      testOnlyAllowUnleasedPaths: true,
      apiKey: 'secret',
      trustedTimeAuthority: { read: async () => trustedTimeSample(1_750_000_100) },
      trustedTimeContext: TRUST_CONTEXT,
      timeoutMs: 50,
      ...overrides,
    }),
    fetchImpl,
  };
}

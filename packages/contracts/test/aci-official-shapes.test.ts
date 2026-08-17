// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  aciReceiptSchema,
  aciSessionSchema,
  aciWorkloadReportSchema,
} from '../src/inference-trust.js';
import {
  ACI_OFFICIAL_FIXTURE_PROVENANCE,
  ACI_RECEIPT_FIXTURE,
  ACI_REPORT_FIXTURE,
  ACI_SESSION_FIXTURE,
  ACI_SESSION_ID,
} from './fixtures/aci-v1.js';

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

const KEYSET_DIGEST = `sha256:${'1'.repeat(64)}`;
const SESSION_ID = '2'.repeat(64);
const BODY_HASH = `sha256:${'3'.repeat(64)}`;
const CLAIMS = {
  gpu_attested: { status: 'unknown' },
  model_weights_provenance: { status: 'unknown' },
  os_known_good: { status: 'unknown' },
  serving_software_known_good: { status: 'unknown' },
  tcb_up_to_date: { status: 'unknown' },
  tee_attested: {
    reason: 'quote verified',
    source: 'hardware_proven',
    status: 'asserted',
  },
};
const CHANNEL_BINDING = [
  {
    origin: 'https://upstream.example.com',
    spki_sha256: '4'.repeat(64),
    type: 'tls_spki_sha256',
  },
];

const OFFICIAL_KEYSET = {
  subject: 'dstack-app://example-app',
  not_after: 1_800_000_000,
  receipt_signing_keys: [
    {
      algo: 'ed25519',
      key_id: 'receipt-1',
      public_key: '5'.repeat(64),
    },
  ],
  e2ee_public_keys: [
    {
      algo: 'x25519-aes-256-gcm-hkdf-sha256',
      key_id: 'e2ee-1',
      public_key: '6'.repeat(64),
    },
  ],
  tls_public_keys: [{ domain: 'upstream.example.com', spki_sha256: '7'.repeat(64) }],
};

const OFFICIAL_REPORT = {
  api_version: 'aci/1',
  workload_keyset_digest: KEYSET_DIGEST,
  attestation: {
    tee_type: 'tdx',
    workload_keyset: OFFICIAL_KEYSET,
    report_data: '8'.repeat(64),
    source_provenance: null,
    evidence: {},
  },
};

const OFFICIAL_SESSION = {
  api_version: 'aci/1',
  upstream_name: 'demo-upstream',
  endpoint: 'https://upstream.example.com',
  verifier_id: 'example/1',
  established_at: 1_750_000_000,
  expires_at: 1_750_003_600,
  channel_binding: CHANNEL_BINDING,
  claims: CLAIMS,
  evidence: {
    data: 'data:application/octet-stream;base64,ZXhhbXBsZQ==',
    digest: `sha256:${'9'.repeat(64)}`,
  },
};

const OFFICIAL_RECEIPT = {
  api_version: 'aci/1',
  receipt_id: 'rcpt-0001',
  chat_id: 'chatcmpl-123',
  model: 'demo-model',
  workload_keyset_digest: KEYSET_DIGEST,
  endpoint: '/v1/chat/completions',
  method: 'POST',
  served_at: 1_750_000_000,
  event_log: [
    { body_hash: BODY_HASH, type: 'request.received' },
    { body_hash: BODY_HASH, type: 'request.forwarded' },
    {
      channel_bindings: CHANNEL_BINDING,
      claims: CLAIMS,
      model_id: 'demo-model',
      provider_claims: null,
      provider_type: null,
      reason: null,
      required: true,
      result: 'verified',
      session_id: SESSION_ID,
      type: 'upstream.verified',
      upstream_name: 'demo-upstream',
      url_origin: 'https://upstream.example.com',
      verifier_id: 'example/1',
    },
    { body_hash: BODY_HASH, type: 'response.received' },
    { body_hash: BODY_HASH, type: 'response.returned' },
    { provider: 'demo', type: 'provider.routing.decision' },
  ],
  key_id: 'receipt-1',
  signature: 'a'.repeat(128),
};

describe('official ACI/1 wire shapes', () => {
  it('accepts opaque future receipt algorithms without relaxing required key fields', () => {
    const result = aciWorkloadReportSchema.safeParse({
      ...OFFICIAL_REPORT,
      attestation: {
        ...OFFICIAL_REPORT.attestation,
        workload_keyset: {
          ...OFFICIAL_KEYSET,
          receipt_signing_keys: [
            {
              algo: 'future-signature-v2',
              key_id: 'receipt-future',
              public_key: 'opaque-future-key-material',
            },
          ],
        },
      },
    });

    expect(result.success).toBe(true);
    expect(
      aciWorkloadReportSchema.safeParse({
        ...OFFICIAL_REPORT,
        attestation: {
          ...OFFICIAL_REPORT.attestation,
          workload_keyset: {
            ...OFFICIAL_KEYSET,
            receipt_signing_keys: [{ algo: 'future-signature-v2', public_key: 'opaque' }],
          },
        },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown fields on fixed keysets and key entries', () => {
    expect(
      aciWorkloadReportSchema.safeParse({
        ...OFFICIAL_REPORT,
        attestation: {
          ...OFFICIAL_REPORT.attestation,
          workload_keyset: { ...OFFICIAL_KEYSET, unexpected: true },
        },
      }).success,
    ).toBe(false);
    expect(
      aciWorkloadReportSchema.safeParse({
        ...OFFICIAL_REPORT,
        attestation: {
          ...OFFICIAL_REPORT.attestation,
          workload_keyset: {
            ...OFFICIAL_KEYSET,
            receipt_signing_keys: [
              { ...OFFICIAL_KEYSET.receipt_signing_keys[0], unexpected: true },
            ],
          },
        },
      }).success,
    ).toBe(false);
    expect(
      aciWorkloadReportSchema.safeParse({
        ...OFFICIAL_REPORT,
        attestation: {
          ...OFFICIAL_REPORT.attestation,
          workload_keyset: {
            ...OFFICIAL_KEYSET,
            tls_public_keys: [{ ...OFFICIAL_KEYSET.tls_public_keys[0], unexpected: true }],
          },
        },
      }).success,
    ).toBe(false);
  });

  it('accepts optional and empty service capabilities', () => {
    expect(
      aciWorkloadReportSchema.safeParse({
        ...OFFICIAL_REPORT,
        service_capabilities: {},
      }).success,
    ).toBe(true);
    expect(
      aciWorkloadReportSchema.safeParse({
        ...OFFICIAL_REPORT,
        service_capabilities: { supported_e2ee_versions: ['future-e2ee-v3'] },
      }).success,
    ).toBe(true);
    expect(
      aciWorkloadReportSchema.safeParse({
        ...OFFICIAL_REPORT,
        attestation: {
          ...OFFICIAL_REPORT.attestation,
          tee_type: 'future-tee-v1',
          workload_keyset: { ...OFFICIAL_KEYSET, e2ee_public_keys: [] },
        },
        service_capabilities: { supported_e2ee_versions: [] },
      }).success,
    ).toBe(true);
    expect(
      aciWorkloadReportSchema.safeParse(
        Object.fromEntries(
          Object.entries(OFFICIAL_REPORT).filter(([key]) => key !== 'service_capabilities'),
        ),
      ).success,
    ).toBe(true);
  });

  it('accepts a report without workload_id, freshness, or keyset_endorsement', () => {
    expect(aciWorkloadReportSchema.safeParse(OFFICIAL_REPORT).success).toBe(true);
  });

  it('accepts a session whose content-addressed id is carried by its candidate envelope', () => {
    expect(aciSessionSchema.safeParse(OFFICIAL_SESSION).success).toBe(true);
    expect('session_id' in OFFICIAL_SESSION).toBe(false);
  });

  it('accepts digest-only session evidence and rejects data without its digest', () => {
    expect(
      aciSessionSchema.safeParse({
        ...OFFICIAL_SESSION,
        evidence: {
          data: 'data:application/octet-stream;base64,ZXhhbXBsZQ==',
          digest: `sha256:${'a'.repeat(64)}`,
        },
      }).success,
    ).toBe(true);
    expect(
      aciSessionSchema.safeParse({
        ...OFFICIAL_SESSION,
        evidence: { digest: OFFICIAL_SESSION.evidence.digest },
      }).success,
    ).toBe(true);
    expect(
      aciSessionSchema.safeParse({
        ...OFFICIAL_SESSION,
        evidence: { data: OFFICIAL_SESSION.evidence.data },
      }).success,
    ).toBe(false);
  });

  it('accepts future claim and channel-binding extensions while keeping known fields required', () => {
    const session = {
      ...OFFICIAL_SESSION,
      channel_binding: [
        ...OFFICIAL_SESSION.channel_binding,
        { type: 'future-channel-binding-v1', metadata: { version: 1 } },
      ],
      claims: {
        ...OFFICIAL_SESSION.claims,
        future_claim_v1: { status: 'unknown', provider_value: 'opaque' },
      },
    };

    expect(aciSessionSchema.safeParse(session).success).toBe(true);
    expect(
      aciSessionSchema.safeParse({
        ...OFFICIAL_SESSION,
        channel_binding: [{ type: 'tls_spki_sha256', origin: CHANNEL_BINDING[0].origin }],
      }).success,
    ).toBe(false);
    expect(
      aciSessionSchema.safeParse({
        ...OFFICIAL_SESSION,
        channel_binding: [
          {
            type: 'future-channel-binding-v1',
            metadata: Array.from({ length: 33 }, () => 'bounded'),
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('accepts a receipt with top-level key_id/signature, body_hash, extensions, and no seq', () => {
    expect(aciReceiptSchema.safeParse(OFFICIAL_RECEIPT).success).toBe(true);
    expect('workload_id' in OFFICIAL_RECEIPT).toBe(false);
    expect(OFFICIAL_RECEIPT.event_log.every((event) => !('seq' in event))).toBe(true);
  });

  it('rejects a receipt whose response is returned before the verified upstream event', () => {
    const eventLog = [...OFFICIAL_RECEIPT.event_log];
    const responseIndex = eventLog.findIndex((event) => event.type === 'response.returned');
    const upstreamIndex = eventLog.findIndex((event) => event.type === 'upstream.verified');
    if (responseIndex < 0 || upstreamIndex < 0) throw new Error('fixture lifecycle is incomplete');
    [eventLog[responseIndex], eventLog[upstreamIndex]] = [
      eventLog[upstreamIndex],
      eventLog[responseIndex],
    ];
    expect(aciReceiptSchema.safeParse({ ...OFFICIAL_RECEIPT, event_log: eventLog }).success).toBe(
      false,
    );
  });

  it('tracks the pinned official fixture values and the verifier identity extension', () => {
    expect(ACI_OFFICIAL_FIXTURE_PROVENANCE).toEqual({
      repository: 'Dstack-TEE/private-ai-gateway',
      commit: '30296dd9a0dbaf06e520f2ed1be01eab75c3c287',
      path: 'clients/verifier-ts/test/fixtures.ts',
      sha256: 'fb75ac5bc7ffa9e02a144a472ddb86a9cde61d5821cded6ea25f74010c15b01f',
    });
    expect(ACI_REPORT_FIXTURE.attestation.source_provenance?.repo_commit).toBe(
      'f9706ad89220b5d033e38a6a9f1d94121bf37488',
    );
    expect(ACI_REPORT_FIXTURE.attestation.evidence).toEqual({ quote_b64: 'AA==' });
    expect(ACI_SESSION_FIXTURE.identity).toEqual({ signing_address: '0x1234' });
    expect(ACI_SESSION_FIXTURE.claims).toEqual({
      tee_attested: {
        reason: 'example quote verified',
        source: 'hardware_proven',
        status: 'asserted',
      },
      gpu_attested: { status: 'unknown' },
      extra: { tcb_status: 'UpToDate' },
    });
    expect(ACI_SESSION_ID).toBe('8d8d6d831647fdf9c7642587f684cc4193610635529d00c8a86ab6909936ba1f');
    expect(ACI_SESSION_ID).toBe(
      createHash('sha256').update(canonicalJson(ACI_SESSION_FIXTURE)).digest('hex'),
    );
  });

  it('accepts a failed upstream attempt before a later successful verification', () => {
    const eventLog = [...ACI_RECEIPT_FIXTURE.event_log];
    eventLog.splice(2, 0, {
      type: 'upstream.verified',
      model_id: 'demo-model',
      result: 'failed',
      required: true,
      reason: 'transient upstream failure',
    });

    expect(
      aciReceiptSchema.safeParse({ ...ACI_RECEIPT_FIXTURE, event_log: eventLog }).success,
    ).toBe(true);
  });
});

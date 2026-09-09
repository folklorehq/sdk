// SPDX-License-Identifier: Apache-2.0
import { createHash, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@folklore/utils';
import { aciWorkloadReportSchema, inferenceTrustPolicyV2Schema } from '@folklore/contracts';
import { ACI_POLICY_FIXTURE, ACI_REPORT_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciPublicQuotePolicyVerifier } from '../src/aci/AciPublicQuotePolicyVerifier.js';
import {
  PublicAciReportVerifier,
  type PublicAciReportVerifierConfig,
} from '../src/aci/AciReportVerifier.js';
import { InMemoryAciKeysetHighWaterAuthority } from './doubles/aci/InMemoryAciStores.js';

const nonce = Buffer.alloc(32, 7);
const sha256 = (value: string | Uint8Array): string =>
  createHash('sha256').update(value).digest('hex');

// Synthetic policy-boundary fixture. Native cryptographic acceptance is tested separately
// with the captured public quote and the real offline executable, not inferred from this stub.
function fixture() {
  const der = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({
    type: 'spki',
    format: 'der',
  });
  const keyset = {
    ...structuredClone(ACI_REPORT_FIXTURE.attestation.workload_keyset),
    not_after: 1_750_003_600,
  };
  const keysetDigest = `sha256:${sha256(canonicalJson(keyset))}`;
  const statement = sha256(
    canonicalJson({
      keyset_digest: keysetDigest,
      nonce: nonce.toString('hex'),
      purpose: 'aci.report_data.v1',
    }),
  );
  const evidence = {
    app_compose: '{"docker_compose_file":"reviewed compose"}',
    downstream_tls_binding: { domain: 'inference.phala.com', spki_sha256: 'a'.repeat(64) },
    event_log: '[]',
    vm_config: '{}',
    quote: '010203',
    quote_report_data: `${statement}${'0'.repeat(64)}`,
    key_custody: {
      provider: 'phala',
      keys: [
        {
          role: 'receipt',
          path: '/key/receipt',
          purpose: 'receipt signing',
          algo: 'ed25519',
          public_key: 'b'.repeat(64),
          kms_public_key: 'c'.repeat(66),
          signature_chain: ['d'.repeat(130)],
        },
      ],
    },
  };
  const report = aciWorkloadReportSchema.parse({
    ...ACI_REPORT_FIXTURE,
    workload_keyset_digest: keysetDigest,
    attestation: {
      ...ACI_REPORT_FIXTURE.attestation,
      workload_keyset: keyset,
      report_data: statement,
      evidence,
    },
  });
  const observed = {
    version: 2,
    verdict: 'accepted',
    failureCode: 'none',
    quoteDigestHex: sha256(Buffer.from(evidence.quote, 'hex')),
    eventLogDigestHex: sha256(evidence.event_log),
    vmConfigDigestHex: sha256(evidence.vm_config),
    quoteRootDigestHex: 'a'.repeat(64),
    reportDataHex: evidence.quote_report_data,
    teeVariant: 'dstack-tdx',
    tcbStatus: 'UpToDate',
    mrTdHex: 'b'.repeat(96),
    rtmr0Hex: '0'.repeat(96),
    rtmr1Hex: '1'.repeat(96),
    rtmr2Hex: '2'.repeat(96),
    rtmr3Hex: '3'.repeat(96),
    replayedRtmr3Hex: '3'.repeat(96),
    appInfo: {
      appIdHex: '4'.repeat(40),
      instanceIdHex: '5'.repeat(40),
      composeHashHex: sha256(evidence.app_compose),
      keyProviderInfoDigestHex: '6'.repeat(64),
    },
    keyProvider: { name: 'kms', id: der.toString('hex') },
  };
  const policy = inferenceTrustPolicyV2Schema.parse({
    ...ACI_POLICY_FIXTURE,
    evidence: {
      ...ACI_POLICY_FIXTURE.evidence,
      profile: 'dstack-tdx-public-v1',
      tcbStatuses: ['UpToDate'],
      runtimeRtmrs: [observed.rtmr0Hex, observed.rtmr1Hex, observed.rtmr2Hex, observed.rtmr3Hex],
      runtimeIdentities: [`dstack-instance:${observed.appInfo.instanceIdHex}`],
      dstackAppIdentities: [`dstack-app:${observed.appInfo.appIdHex}`],
      measuredComposeDigests: [`sha256:${observed.appInfo.composeHashHex}`],
      dstackKmsRoots: [sha256(der)],
    },
  });
  const native = { verify: vi.fn(async (_input: unknown) => observed) };
  return { report, policy, observed, native };
}

describe('explicit public quote policy boundary', () => {
  function reportConfig(f: ReturnType<typeof fixture>): PublicAciReportVerifierConfig {
    const context = {
      orgId: 'org-1',
      deploymentId: 'deployment-1',
      bootEpoch: 'boot-1',
      checkpointDigest: 'a'.repeat(64),
    };
    return {
      baseUrl: f.policy.origin,
      policy: f.policy,
      activationGeneration: 1,
      publicQuoteVerifier: f.native,
      fetchImpl: vi.fn(async () => {
        const response = new Response(JSON.stringify(f.report), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
        Object.defineProperty(response, 'url', { value: `${f.policy.origin}/v1/aci/attestation` });
        return response;
      }),
      nonceSource: () => nonce,
      trustedTimeContext: context,
      trustedTimeAuthority: { read: async () => ({ trustedNow: 1_750_000_000, ...context }) },
      keysetHighWaterAuthority: new InMemoryAciKeysetHighWaterAuthority(),
    };
  }

  it('routes the explicit public report through the actual freshness/high-water core', async () => {
    const f = fixture();
    const config = reportConfig(f);
    const admit = vi.spyOn(config.keysetHighWaterAuthority, 'admitKeyset');
    const keyset = await new PublicAciReportVerifier(config).verify();
    expect(keyset.workloadKeysetDigest).toBe(f.report.workload_keyset_digest);
    expect(admit).toHaveBeenCalledOnce();
    expect(keyset.receiptSigningKeys[0]?.keyId).toBe('receipt-1');
  });

  it('does not admit a keyset if native verification fails', async () => {
    const f = fixture();
    f.observed.verdict = 'rejected';
    const config = reportConfig(f);
    const admit = vi.spyOn(config.keysetHighWaterAuthority, 'admitKeyset');
    await expect(new PublicAciReportVerifier(config).verify()).rejects.toThrow(
      'native_result_malformed',
    );
    expect(admit).not.toHaveBeenCalled();
  });

  it('does not bypass trusted-time or high-water failure on the public path', async () => {
    const f = fixture();
    const config = reportConfig(f);
    config.trustedTimeAuthority = {
      read: async () => {
        throw new Error('clock unavailable');
      },
    };
    await expect(new PublicAciReportVerifier(config).verify()).rejects.toThrow('clock_invalid');
    expect(f.native.verify).not.toHaveBeenCalled();
    const healthyClock = reportConfig(f);
    vi.spyOn(healthyClock.keysetHighWaterAuthority, 'admitKeyset').mockRejectedValue(
      new Error('storage unavailable'),
    );
    await expect(new PublicAciReportVerifier(healthyClock).verify()).rejects.toThrow(
      'high_water_unavailable',
    );
  });

  it('rechecks keyset expiration after native verification', async () => {
    const f = fixture();
    const config = reportConfig(f);
    const admit = vi.spyOn(config.keysetHighWaterAuthority, 'admitKeyset');
    const read = vi.fn(config.trustedTimeAuthority.read);
    read.mockResolvedValueOnce({ trustedNow: 1_750_000_000, ...config.trustedTimeContext });
    read.mockResolvedValue({
      trustedNow: f.report.attestation.workload_keyset.not_after,
      ...config.trustedTimeContext,
    });
    config.trustedTimeAuthority = { read };
    await expect(new PublicAciReportVerifier(config).verify()).rejects.toThrow('keyset_expired');
    expect(admit).not.toHaveBeenCalled();
  });

  it('binds independent observations without an internal native session envelope', async () => {
    const f = fixture();
    await expect(
      new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
        f.report,
        nonce,
        1_750_000_000,
      ),
    ).resolves.toBeUndefined();
    expect(f.native.verify.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        evidence: f.report.attestation.evidence,
        evaluationTimeUnixSeconds: 1_750_000_000,
      }),
    );
    expect(f.native.verify.mock.calls[0]?.[0]).not.toHaveProperty('expected');
  });

  it('requires a signed opt-in and does not reinterpret existing policy pins', () => {
    const f = fixture();
    delete f.policy.evidence.profile;
    expect(() => new AciPublicQuotePolicyVerifier(f.native, f.policy, 100)).toThrow(
      'policy_invalid',
    );
    expect(inferenceTrustPolicyV2Schema.parse(ACI_POLICY_FIXTURE).evidence.profile).toBeUndefined();
    expect(canonicalJson(inferenceTrustPolicyV2Schema.parse(ACI_POLICY_FIXTURE))).toBe(
      canonicalJson(ACI_POLICY_FIXTURE),
    );
    expect(
      inferenceTrustPolicyV2Schema.safeParse({
        ...f.policy,
        evidence: { ...f.policy.evidence, profile: 'unknown-profile' },
      }).success,
    ).toBe(false);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'rejects invalid trusted time %s',
    async (time) => {
      const f = fixture();
      await expect(
        new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(f.report, nonce, time),
      ).rejects.toThrow('clock_invalid');
      expect(f.native.verify).not.toHaveBeenCalled();
    },
  );

  it('rejects a non-32-byte nonce before native invocation', async () => {
    const f = fixture();
    await expect(
      new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
        f.report,
        Buffer.alloc(16),
        1_750_000_000,
      ),
    ).rejects.toThrow('nonce_must_be_32_bytes');
    expect(f.native.verify).not.toHaveBeenCalled();
  });

  it('cannot promise an unverified image predicate', () => {
    const f = fixture();
    f.policy.evidence.imageDigests = [`sha256:${'9'.repeat(64)}`];
    expect(() => new AciPublicQuotePolicyVerifier(f.native, f.policy, 100)).toThrow(
      'policy_invalid',
    );
  });

  it.each([
    'quoteDigestHex',
    'eventLogDigestHex',
    'vmConfigDigestHex',
    'quoteRootDigestHex',
    'reportDataHex',
    'mrTdHex',
    'rtmr0Hex',
    'rtmr1Hex',
    'rtmr2Hex',
    'rtmr3Hex',
    'replayedRtmr3Hex',
  ] as const)('rejects substituted %s', async (field) => {
    const f = fixture();
    f.observed[field] = '9'.repeat(f.observed[field].length);
    await expect(
      new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
        f.report,
        nonce,
        1_750_000_000,
      ),
    ).rejects.toThrow();
  });

  it('rejects a wrong nonce before trusting native evidence', async () => {
    const f = fixture();
    await expect(
      new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
        f.report,
        Buffer.alloc(32, 8),
        1_750_000_000,
      ),
    ).rejects.toThrow('report_data_mismatch');
    expect(f.native.verify).not.toHaveBeenCalled();
  });

  it.each(['appIdHex', 'instanceIdHex', 'composeHashHex'] as const)(
    'rejects substituted %s',
    async (field) => {
      const f = fixture();
      f.observed.appInfo[field] = '9'.repeat(f.observed.appInfo[field].length);
      await expect(
        new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
          f.report,
          nonce,
          1_750_000_000,
        ),
      ).rejects.toThrow();
    },
  );

  it('does not confuse the whole provider-event digest with the CA SPKI identity', async () => {
    const f = fixture();
    f.policy.evidence.dstackKmsRoots = [f.observed.appInfo.keyProviderInfoDigestHex];
    await expect(
      new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
        f.report,
        nonce,
        1_750_000_000,
      ),
    ).rejects.toThrow('native_policy_mismatch');
  });

  it('rejects a noncanonical CA DER value even if its bytes are allowlisted', async () => {
    const f = fixture();
    f.observed.keyProvider.id += '00';
    f.policy.evidence.dstackKmsRoots = [sha256(Buffer.from(f.observed.keyProvider.id, 'hex'))];
    await expect(
      new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
        f.report,
        nonce,
        1_750_000_000,
      ),
    ).rejects.toThrow('native_policy_mismatch');
  });

  it('rejects native rejection without treating returned fields as observations', async () => {
    const f = fixture();
    f.observed.verdict = 'rejected';
    await expect(
      new AciPublicQuotePolicyVerifier(f.native, f.policy, 100).verify(
        f.report,
        nonce,
        1_750_000_000,
      ),
    ).rejects.toThrow('native_result_malformed');
  });

  it('aborts an overdue native operation', async () => {
    const f = fixture();
    let signal: AbortSignal | undefined;
    const native = {
      verify: (input: { signal: AbortSignal }) => {
        signal = input.signal;
        return new Promise<never>(() => {});
      },
    };
    await expect(
      new AciPublicQuotePolicyVerifier(native, f.policy, 5).verify(f.report, nonce, 1_750_000_000),
    ).rejects.toThrow('native_verifier_timeout');
    expect(signal?.aborted).toBe(true);
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  canaryAuthorizationOutcomeProofPayload,
  canaryAuthorizationProofPayload,
  canaryAuthorizationSchema,
  canaryAuthorizationOutcomeProofSchema,
} from '../src/canary-authorization.js';

describe('canary authorization contract', () => {
  it('contains only content-free routing and digest fields', () => {
    const authorization = canaryAuthorizationSchema.parse({
      version: 1,
      authorization_id: '11111111-1111-4111-8111-111111111111',
      org_id: '22222222-2222-4222-8222-222222222222',
      deployment_id: 'deployment-1',
      canary_run_id: '33333333-3333-4333-8333-333333333333',
      request_id: 'delivery-1',
      body_sha256: 'a'.repeat(64),
      attestation_challenge_id: '44444444-4444-4444-8444-444444444444',
      attestation_generation: '55555555-5555-4555-8555-555555555555',
      attestation_session_key_sha256: 'b'.repeat(64),
      issued_at: '2026-08-12T12:00:00.000Z',
      expires_at: '2026-08-12T12:05:00.000Z',
    });

    const payload = canaryAuthorizationProofPayload({
      ...authorization,
      public_key: `${'A'.repeat(43)}=`,
    });

    expect(payload).not.toContain('payload');
    expect(payload).not.toContain('content');
    expect(payload).toContain(authorization.body_sha256);
  });

  it('binds a successful content-free pipeline outcome to the authorization proof', () => {
    const proof = canaryAuthorizationOutcomeProofSchema.parse({
      version: 1,
      authorization_id: '11111111-1111-4111-8111-111111111111',
      org_id: '22222222-2222-4222-8222-222222222222',
      deployment_id: 'deployment-1',
      canary_run_id: '33333333-3333-4333-8333-333333333333',
      request_id: 'delivery-1',
      body_sha256: 'a'.repeat(64),
      attestation_challenge_id: '44444444-4444-4444-8444-444444444444',
      attestation_generation: '55555555-5555-4555-8555-555555555555',
      attestation_session_key_sha256: 'b'.repeat(64),
      issued_at: '2026-08-12T12:00:00.000Z',
      expires_at: '2026-08-12T12:05:00.000Z',
      public_key: `${'A'.repeat(43)}=`,
      signature: `${'A'.repeat(86)}==`,
      status: 'succeeded',
      fact_count: 2,
      outcome_sha256: 'c'.repeat(64),
    });

    const payload = canaryAuthorizationOutcomeProofPayload(proof);

    expect(payload).toContain(proof.outcome_sha256);
    expect(payload).toContain('succeeded');
    expect(payload).not.toContain('customer content');
  });
});

// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  assignmentHeadV1Payload,
  assignmentHeadV1Schema,
  headAppendAuthorizationPayload,
  headAppendAuthorizationSchema,
  signedAssignmentHeadResponsePayload,
  signedAssignmentHeadResponseSchema,
} from '../src/assignment-head.js';

function headFixture(): Record<string, unknown> {
  return {
    version: 1,
    poolId: 'pool-1',
    headGeneration: 7,
    minimumAssignmentGeneration: 6,
    manifestDigest: 'a'.repeat(64),
    releaseDigest: 'b'.repeat(64),
    inferencePolicyDigest: 'c'.repeat(64),
    migrationEpoch: 3,
    controlCommandHeadDigest: 'd'.repeat(64),
    predecessorDigest: 'e'.repeat(64),
    recordedAt: '2026-08-09T12:00:00.000Z',
  };
}

function signResponse(
  nonce: string,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
): Record<string, unknown> {
  const unsigned = signedAssignmentHeadResponseSchema.parse({
    version: 1,
    head: headFixture(),
    headDigest: 'f'.repeat(64),
    nonce,
    issuedAt: '2026-08-09T12:00:00.000Z',
    expiresAt: '2026-08-09T12:01:00.000Z',
    custodianKeyId: 'custodian-key-1',
    algorithm: 'RSASSA_PSS_SHA_256',
    signature: 'A'.repeat(344),
  });
  return {
    ...unsigned,
    signature: sign('sha256', Buffer.from(signedAssignmentHeadResponsePayload(unsigned)), {
      key: privateKey,
      padding: 6,
      saltLength: 32,
    }).toString('base64'),
  };
}

describe('assignmentHeadV1Schema', () => {
  it('stores only immutable nonce-free chain state', () => {
    const head = assignmentHeadV1Schema.parse(headFixture());
    expect(assignmentHeadV1Payload(head)).toBe(
      `folklore.assignment-head.v1\u00001\u0000pool-1\u00007\u00006\u0000${'a'.repeat(64)}\u0000${'b'.repeat(64)}\u0000${'c'.repeat(64)}\u00003\u0000${'d'.repeat(64)}\u0000${'e'.repeat(64)}\u00002026-08-09T12:00:00.000Z`,
    );
    expect(() => assignmentHeadV1Schema.parse({ ...head, nonce: 'A'.repeat(43) + '=' })).toThrow();
    expect(() => assignmentHeadV1Schema.parse({ ...head, signature: 'signed-response' })).toThrow();
    expect(() =>
      assignmentHeadV1Schema.parse({ ...head, expiresAt: '2026-08-09T13:00:00.000Z' }),
    ).toThrow();
    expect(() =>
      assignmentHeadV1Schema.parse({ ...head, predecessorDigest: 'E'.repeat(64) }),
    ).toThrow();
    expect(() =>
      assignmentHeadV1Schema.parse({ ...head, recordedAt: '2026-08-09T12:00:00.000+00:00' }),
    ).toThrow();
  });
});

describe('signedAssignmentHeadResponseSchema', () => {
  it('binds one immutable head and digest to a fresh nonce under real custodian signatures', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const first = signedAssignmentHeadResponseSchema.parse(
      signResponse('A'.repeat(43) + '=', privateKey),
    );
    const second = signedAssignmentHeadResponseSchema.parse(
      signResponse('B'.repeat(43) + '=', privateKey),
    );
    const firstPayload = Buffer.from(signedAssignmentHeadResponsePayload(first));
    const secondPayload = Buffer.from(signedAssignmentHeadResponsePayload(second));

    expect(
      verify(
        'sha256',
        firstPayload,
        { key: publicKey, padding: 6, saltLength: 32 },
        Buffer.from(first.signature, 'base64'),
      ),
    ).toBe(true);
    expect(
      verify(
        'sha256',
        secondPayload,
        { key: publicKey, padding: 6, saltLength: 32 },
        Buffer.from(second.signature, 'base64'),
      ),
    ).toBe(true);
    expect(
      verify(
        'sha256',
        secondPayload,
        { key: publicKey, padding: 6, saltLength: 32 },
        Buffer.from(first.signature, 'base64'),
      ),
    ).toBe(false);

    for (const changed of [
      { ...first, head: { ...first.head, poolId: 'pool-2' } },
      { ...first, head: { ...first.head, headGeneration: 8 } },
      { ...first, head: { ...first.head, minimumAssignmentGeneration: 5 } },
      { ...first, head: { ...first.head, manifestDigest: '0'.repeat(64) } },
      { ...first, head: { ...first.head, releaseDigest: '1'.repeat(64) } },
      { ...first, head: { ...first.head, inferencePolicyDigest: '2'.repeat(64) } },
      { ...first, head: { ...first.head, migrationEpoch: 4 } },
      { ...first, head: { ...first.head, controlCommandHeadDigest: '3'.repeat(64) } },
      { ...first, headDigest: '0'.repeat(64) },
      { ...first, head: { ...first.head, predecessorDigest: '1'.repeat(64) } },
      { ...first, head: { ...first.head, recordedAt: '2026-08-09T12:00:01.000Z' } },
      { ...first, nonce: 'B'.repeat(43) + '=' },
      { ...first, issuedAt: '2026-08-09T12:00:01.000Z' },
      { ...first, expiresAt: '2026-08-09T12:02:00.000Z' },
      { ...first, custodianKeyId: 'custodian-key-2' },
    ]) {
      const payload = Buffer.from(
        signedAssignmentHeadResponsePayload(signedAssignmentHeadResponseSchema.parse(changed)),
      );
      expect(
        verify(
          'sha256',
          payload,
          { key: publicKey, padding: 6, saltLength: 32 },
          Buffer.from(first.signature, 'base64'),
        ),
      ).toBe(false);
    }
    for (const field of Object.keys(first)) {
      expect(() =>
        signedAssignmentHeadResponseSchema.parse(
          Object.fromEntries(Object.entries(first).filter(([key]) => key !== field)),
        ),
      ).toThrow();
    }
    expect(() =>
      signedAssignmentHeadResponseSchema.parse({ ...first, response: 'customer content' }),
    ).toThrow();
    expect(() =>
      signedAssignmentHeadResponseSchema.parse({ ...first, expiresAt: first.issuedAt }),
    ).toThrow();
  });
});

describe('headAppendAuthorizationSchema', () => {
  it('requires complete approval evidence rather than a caller-supplied digest', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const unsigned = {
      version: 1,
      head: headFixture(),
      approval: {
        recordId: 'approval-1',
        recordDigest: 'f'.repeat(64),
        signerKeyId: 'approval-key-1',
        algorithm: 'Ed25519',
        signature: 'A'.repeat(86) + '==',
      },
      issuer: {
        keyId: 'issuer-key-1',
        algorithm: 'RSASSA_PSS_SHA_256',
        signature: 'A'.repeat(344),
      },
    };
    const authorization = headAppendAuthorizationSchema.parse({
      ...unsigned,
      issuer: {
        ...unsigned.issuer,
        signature: sign(
          'sha256',
          Buffer.from(
            headAppendAuthorizationPayload(headAppendAuthorizationSchema.parse(unsigned)),
          ),
          { key: privateKey, padding: 6, saltLength: 32 },
        ).toString('base64'),
      },
    });
    const parsed = authorization;
    expect(headAppendAuthorizationPayload(parsed)).toBe(
      `folklore.head-append-authorization.v1\u00001\u0000pool-1\u00007\u00006\u0000${'a'.repeat(64)}\u0000${'b'.repeat(64)}\u0000${'c'.repeat(64)}\u00003\u0000${'d'.repeat(64)}\u0000${'e'.repeat(64)}\u00002026-08-09T12:00:00.000Z\u0000approval-1\u0000${'f'.repeat(64)}\u0000approval-key-1\u0000Ed25519\u0000${'A'.repeat(86)}==\u0000issuer-key-1\u0000RSASSA_PSS_SHA_256`,
    );
    expect(
      verify(
        'sha256',
        Buffer.from(headAppendAuthorizationPayload(parsed)),
        { key: publicKey, padding: 6, saltLength: 32 },
        Buffer.from(parsed.issuer.signature, 'base64'),
      ),
    ).toBe(true);
    for (const changed of [
      { ...parsed, head: { ...parsed.head, poolId: 'pool-2' } },
      { ...parsed, head: { ...parsed.head, headGeneration: 8 } },
      { ...parsed, head: { ...parsed.head, minimumAssignmentGeneration: 5 } },
      { ...parsed, head: { ...parsed.head, manifestDigest: '0'.repeat(64) } },
      { ...parsed, head: { ...parsed.head, releaseDigest: '1'.repeat(64) } },
      { ...parsed, head: { ...parsed.head, inferencePolicyDigest: '2'.repeat(64) } },
      { ...parsed, head: { ...parsed.head, migrationEpoch: 4 } },
      { ...parsed, head: { ...parsed.head, controlCommandHeadDigest: '3'.repeat(64) } },
      { ...parsed, head: { ...parsed.head, predecessorDigest: '4'.repeat(64) } },
      { ...parsed, head: { ...parsed.head, recordedAt: '2026-08-09T12:00:01.000Z' } },
      { ...parsed, approval: { ...parsed.approval, recordId: 'approval-2' } },
      { ...parsed, approval: { ...parsed.approval, recordDigest: '5'.repeat(64) } },
      { ...parsed, approval: { ...parsed.approval, signerKeyId: 'approval-key-2' } },
      { ...parsed, approval: { ...parsed.approval, signature: 'B'.repeat(86) + '==' } },
      { ...parsed, issuer: { ...parsed.issuer, keyId: 'issuer-key-2' } },
    ]) {
      const payload = Buffer.from(
        headAppendAuthorizationPayload(headAppendAuthorizationSchema.parse(changed)),
      );
      expect(
        verify(
          'sha256',
          payload,
          { key: publicKey, padding: 6, saltLength: 32 },
          Buffer.from(parsed.issuer.signature, 'base64'),
        ),
      ).toBe(false);
    }
    expect(() =>
      headAppendAuthorizationSchema.parse({ head: headFixture(), approvalDigest: 'f'.repeat(64) }),
    ).toThrow();
    expect(() =>
      headAppendAuthorizationSchema.parse({ ...authorization, callerHeadDigest: 'f'.repeat(64) }),
    ).toThrow();
    expect(() =>
      headAppendAuthorizationSchema.parse({
        ...authorization,
        approval: { ...authorization.approval, signature: undefined },
      }),
    ).toThrow();
    expect(() =>
      headAppendAuthorizationSchema.parse({
        ...authorization,
        issuer: { ...authorization.issuer, algorithm: 'Ed25519' },
      }),
    ).toThrow();
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  commissioningDispatchBindingV1Schema,
  currentAuthorityPointerKey,
  currentAuthorityPointerV2Schema,
  decodeCurrentAuthorityPointer,
  encodeCurrentAuthorityPointer,
} from '../src/current-authority-pointer.js';

const POOL = '7780ed3a-7864-46a5-a287-36555763b424';
const OP = '7d7c8b26-09c0-8a90-9e54-8f6e9926aac3';
const ARN = `arn:aws:secretsmanager:us-east-1:111122223333:secret:folklore-platform-prod/pool/commissioning-request/${OP}-AbCdEf`;

function pointer() {
  return currentAuthorityPointerV2Schema.parse({
    schemaVersion: 2,
    poolDeploymentId: POOL,
    operationId: OP,
    generation: 10,
    predecessorDigest: null,
    requestDigest: 'a'.repeat(64),
    operationSubjectDigest: 'b'.repeat(64),
    expiresAt: '2026-09-10T02:33:00.000Z',
    requestSecretArn: ARN,
    mintedAt: '2026-09-09T02:45:00.000Z',
    mintedBy: 'mint-commissioning-generation/run-1',
  });
}

describe('current-authority pointer V2', () => {
  it('round-trips through DynamoDB attribute encoding', () => {
    const encoded = encodeCurrentAuthorityPointer(pointer());
    expect(encoded['pk']).toEqual({ S: currentAuthorityPointerKey(POOL) });
    expect(encoded['predecessorDigest']).toEqual({ NULL: true });
    expect(decodeCurrentAuthorityPointer(encoded)).toEqual(pointer());
  });

  it('treats the legacy V1 pointer as absent so callers fall back to env', () => {
    expect(
      decodeCurrentAuthorityPointer({
        pk: { S: currentAuthorityPointerKey(POOL) },
        operationId: { S: OP },
        generation: { N: '9' },
        requestDigest: { S: 'a'.repeat(64) },
      }),
    ).toBeUndefined();
    expect(decodeCurrentAuthorityPointer(undefined)).toBeUndefined();
  });

  it.each([
    [
      'unknown version',
      { schemaVersion: { N: '3' } },
      'current_authority_pointer_version_unsupported',
    ],
    ['missing secret arn', { requestSecretArn: undefined }, 'current_authority_pointer_invalid'],
    [
      'non-canonical expiry',
      { expiresAt: { S: '2026-09-10T02:33:00Z' } },
      'current_authority_pointer_invalid',
    ],
    [
      'foreign secret arn',
      { requestSecretArn: { S: 'arn:aws:ssm:us-east-1:111122223333:parameter/x' } },
      'current_authority_pointer_invalid',
    ],
    [
      'non-v8 operation id',
      { operationId: { S: '7d7c8b26-09c0-4a90-9e54-8f6e9926aac3' } },
      'current_authority_pointer_invalid',
    ],
  ])('rejects a malformed V2 pointer: %s', (_name, patch, code) => {
    const encoded = Object.fromEntries(
      Object.entries({ ...encodeCurrentAuthorityPointer(pointer()), ...patch }).filter(
        ([, value]) => value !== undefined,
      ),
    );
    expect(() =>
      decodeCurrentAuthorityPointer(encoded as Parameters<typeof decodeCurrentAuthorityPointer>[0]),
    ).toThrow(code);
  });

  it('projects the same dispatch binding shape the control plane already accepts', () => {
    const binding = commissioningDispatchBindingV1Schema.parse(pointer());
    expect(Object.keys(binding).sort()).toEqual(
      [
        'expiresAt',
        'generation',
        'operationId',
        'operationSubjectDigest',
        'poolDeploymentId',
        'predecessorDigest',
        'requestDigest',
      ].sort(),
    );
  });
});

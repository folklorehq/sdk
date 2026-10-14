// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  enclaveOutputBindingForPayload,
  enclaveOutputEnvelopeSchema,
  enclaveOutputTypeSchema,
} from '../src/enclave-output.js';

function envelope() {
  return {
    outputType: 'wiki_synthesis' as const,
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    assignmentGeneration: 7,
    outputId: 'request-1',
    nonce: '11'.repeat(32),
    resourceIds: ['fact-1', 'theme-1'],
    payload: { type: 'wiki_synthesis', requestId: 'request-1' },
    version: 1 as const,
    payloadDigest: 'a'.repeat(64),
    authenticator: {
      keyId: 'test-output-key',
      algorithm: 'Ed25519' as const,
      signature: `${'A'.repeat(85)}A==`,
    },
  };
}

describe('enclaveOutputEnvelopeSchema', () => {
  it('accepts a strict signed-envelope shape', () => {
    const value = envelope();
    expect(enclaveOutputEnvelopeSchema.parse(value)).toEqual(value);
  });

  it('rejects a missing signature and noncanonical resource ordering', () => {
    const value = envelope();
    const { signature: _signature, ...authenticatorFields } = value.authenticator;

    expect(() =>
      enclaveOutputEnvelopeSchema.parse({
        ...value,
        authenticator: authenticatorFields,
      }),
    ).toThrow();
    expect(() =>
      enclaveOutputEnvelopeSchema.parse({
        ...value,
        resourceIds: [...value.resourceIds].reverse(),
      }),
    ).toThrow();
    expect(() =>
      enclaveOutputEnvelopeSchema.parse({
        ...value,
        resourceIds: ['fact-1', 'fact-1'],
      }),
    ).toThrow();
  });

  it('rejects unknown envelope and authenticator fields', () => {
    const value = envelope();

    expect(() => enclaveOutputEnvelopeSchema.parse({ ...value, unexpected: true })).toThrow();
    expect(() =>
      enclaveOutputEnvelopeSchema.parse({
        ...value,
        authenticator: { ...value.authenticator, unexpected: true },
      }),
    ).toThrow();
  });
});

describe('association judgement binding', () => {
  const identity = {
    deploymentId: 'deployment-1',
    assignmentGeneration: 3,
    nonce: '22'.repeat(32),
  };
  const payload = {
    type: 'association_judgement',
    requestId: 'b'.repeat(64),
    orgId: 'org-1',
    verdicts: [{ factId: 'fact-b' }, { factId: 'fact-a' }, { factId: 'fact-b' }],
  };

  it('binds the request id and the sorted unique fact ids', () => {
    const binding = enclaveOutputBindingForPayload(payload, identity);

    expect(binding.outputType).toBe('association_judgement');
    expect(binding.outputId).toBe('b'.repeat(64));
    expect(binding.resourceIds).toEqual(['fact-a', 'fact-b']);
  });

  it('accepts the output type on a signed envelope', () => {
    expect(enclaveOutputTypeSchema.safeParse('association_judgement').success).toBe(true);
  });

  it('rejects a verdict without a fact id', () => {
    const missing = { ...payload, verdicts: [{ scoreId: 'score-1' }] };

    expect(() => enclaveOutputBindingForPayload(missing, identity)).toThrow(
      'enclave_output_field_invalid',
    );
  });
});

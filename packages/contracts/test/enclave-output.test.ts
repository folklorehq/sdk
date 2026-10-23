// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  enclaveOutputBindingForPayload,
  enclaveOutputEnvelopeSchema,
  enclaveOutputTypeSchema,
} from '../src/enclave-output.js';
import { memberIdentityLinkOutputSchema } from '../src/member-identity-links.js';

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

describe('wiki synthesis deferral binding', () => {
  const identity = {
    deploymentId: 'deployment-1',
    assignmentGeneration: 3,
    nonce: '33'.repeat(32),
  };
  const payload = {
    type: 'wiki_synthesis_deferred',
    requestId: 'c'.repeat(64),
    themeId: 'theme-1',
    orgId: 'org-1',
    leaseToken: 'lease-1',
    reason: 'provider_outage',
    tokenUsage: [],
  };

  it('binds a distinct output id and the theme id', () => {
    const binding = enclaveOutputBindingForPayload(payload, identity);

    expect(binding.outputType).toBe('wiki_synthesis_deferred');
    expect(binding.outputId).toBe(`${'c'.repeat(64)}:deferred`);
    expect(binding.resourceIds).toEqual(['theme-1']);
  });

  it('accepts the output type on a signed envelope', () => {
    expect(enclaveOutputTypeSchema.safeParse('wiki_synthesis_deferred').success).toBe(true);
  });

  it('rejects a deferral without a theme id', () => {
    const { themeId: _themeId, ...missing } = payload;

    expect(() => enclaveOutputBindingForPayload(missing, identity)).toThrow(
      'enclave_output_field_invalid',
    );
  });
});

describe('member identity link output', () => {
  const identity = {
    deploymentId: 'deployment-1',
    assignmentGeneration: 3,
    nonce: '33'.repeat(32),
  };
  const payload = {
    type: 'member_identity_link' as const,
    orgId: '123e4567-e89b-42d3-a456-426614174000',
    linkId: 'link-1',
    kind: 'github',
    sourceUserId: '4242',
    memberEmail: 'member@example.test',
  };

  it('accepts a canonical link', () => {
    expect(memberIdentityLinkOutputSchema.parse(payload)).toEqual(payload);
  });

  it.each([
    ['an extra key', { ...payload, extra: 1 }],
    ['a non-UUID org id', { ...payload, orgId: 'org-1' }],
    ['a malformed email', { ...payload, memberEmail: 'not-an-email' }],
    ['an empty link id', { ...payload, linkId: '' }],
    ['an over-long link id', { ...payload, linkId: 'x'.repeat(129) }],
    ['an over-long kind', { ...payload, kind: 'k'.repeat(65) }],
    ['an empty source user id', { ...payload, sourceUserId: '' }],
    ['an over-long source user id', { ...payload, sourceUserId: 'u'.repeat(257) }],
    ['an over-long email', { ...payload, memberEmail: `${'a'.repeat(310)}@example.test` }],
    ['a wrong type', { ...payload, type: 'processed_fact' }],
  ])('rejects %s', (_label, value) => {
    expect(memberIdentityLinkOutputSchema.safeParse(value).success).toBe(false);
  });

  it('binds the link id as the output id and the only resource id', () => {
    const binding = enclaveOutputBindingForPayload(payload, identity);

    expect(binding.outputType).toBe('member_identity_link');
    expect(binding.outputId).toBe('link-1');
    expect(binding.resourceIds).toEqual(['link-1']);
    expect(binding.orgId).toBe(payload.orgId);
  });

  it('carries the signing nonce, so a re-emission of one link is a distinct output', () => {
    const first = enclaveOutputBindingForPayload(payload, identity);
    const second = enclaveOutputBindingForPayload(payload, { ...identity, nonce: '44'.repeat(32) });

    expect(first.nonce).toBe(identity.nonce);
    expect(second.nonce).not.toBe(first.nonce);
    expect(second.outputId).toBe(first.outputId);
  });

  it('refuses a binding with a nonce that is not 64 lowercase hex characters', () => {
    expect(() => enclaveOutputBindingForPayload(payload, { ...identity, nonce: 'zz' })).toThrow();
  });

  it('refuses a link without a link id', () => {
    const { linkId: _linkId, ...missing } = payload;

    expect(() => enclaveOutputBindingForPayload(missing, identity)).toThrow(
      'enclave_output_field_invalid',
    );
  });

  it('lists every output type in a stable order', () => {
    expect(enclaveOutputTypeSchema.options).toEqual([
      'processed_fact',
      'pull_complete',
      'pull_failed',
      'wiki_synthesis',
      'wiki_synthesis_deferred',
      'theme_synthesis',
      'team_onboarding_synthesis',
      'association_judgement',
      'theme_merge_adjudication',
      'member_identity_link',
      'fact_authors',
    ]);
  });

  it('still refuses an unknown type', () => {
    expect(() =>
      enclaveOutputBindingForPayload(
        { type: 'member_identity_unlink', orgId: payload.orgId },
        identity,
      ),
    ).toThrow('enclave_output_type_invalid');
  });
});

describe('fact authors binding', () => {
  const identity = {
    deploymentId: 'deployment-1',
    assignmentGeneration: 3,
    nonce: '55'.repeat(32),
  };
  const factA = '00000000-0000-4000-8000-00000000000a';
  const factB = '00000000-0000-4000-8000-00000000000b';
  const payload = {
    type: 'fact_authors',
    requestId: 'c'.repeat(64),
    orgId: '123e4567-e89b-42d3-a456-426614174000',
    facts: [
      { factId: factB, authors: [] },
      { factId: factA, authors: [] },
      { factId: factB, authors: [] },
    ],
    skipped: 0,
  };

  it('binds the request id and the sorted unique fact ids', () => {
    const binding = enclaveOutputBindingForPayload(payload, identity);

    expect(binding.outputType).toBe('fact_authors');
    expect(binding.outputId).toBe('c'.repeat(64));
    expect(binding.resourceIds).toEqual([factA, factB]);
    expect(binding.orgId).toBe(payload.orgId);
  });

  it('binds a result with no facts to an empty resource list', () => {
    const empty = { ...payload, facts: [], skipped: 3 };

    expect(enclaveOutputBindingForPayload(empty, identity).resourceIds).toEqual([]);
  });

  it('refuses a fact without a fact id', () => {
    const missing = { ...payload, facts: [{ authors: [] }] };

    expect(() => enclaveOutputBindingForPayload(missing, identity)).toThrow(
      'enclave_output_field_invalid',
    );
  });

  it('refuses a result without a request id', () => {
    const { requestId: _requestId, ...missing } = payload;

    expect(() => enclaveOutputBindingForPayload(missing, identity)).toThrow(
      'enclave_output_field_invalid',
    );
  });

  it('carries the signing nonce', () => {
    const next = enclaveOutputBindingForPayload(payload, { ...identity, nonce: '66'.repeat(32) });

    expect(next.nonce).toBe('66'.repeat(32));
  });

  it('adds the output type after member_identity_link', () => {
    expect(enclaveOutputTypeSchema.options.slice(-2)).toEqual([
      'member_identity_link',
      'fact_authors',
    ]);
  });
});

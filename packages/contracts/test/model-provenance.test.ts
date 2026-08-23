// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assertControlledGatewayModelArtifactBindingV1,
  assertPolicySignedModelProvenanceTupleV1,
  assertProductionVerifiedModelProvenanceV1,
  assertProviderNativeModelArtifactBindingV1,
  assertSyntheticVerifiedModelProvenanceV1,
  assertUnknownModelProvenanceV1,
  assertVerifiedModelProvenanceV1,
  controlledGatewayModelArtifactBindingV1Schema,
  isControlledGatewayModelArtifactBindingV1,
  isPolicySignedModelProvenanceTupleV1,
  isProductionVerifiedModelProvenanceV1,
  isProviderNativeModelArtifactBindingV1,
  isSyntheticVerifiedModelProvenanceV1,
  isUnknownModelProvenanceV1,
  isVerifiedModelProvenanceV1,
  modelExecutionModeV1Schema,
  modelProvenanceSourceV1Schema,
  modelProvenanceStatusV1Schema,
  policySignedModelProvenanceTupleV1Schema,
  productionVerifiedModelProvenanceV1Schema,
  providerNativeModelArtifactBindingV1Schema,
  syntheticVerifiedModelProvenanceV1Schema,
  unknownModelProvenanceV1Schema,
  verifiedModelProvenanceV1Schema,
} from '../src/model-provenance.js';

const DIGEST = 'a'.repeat(64);

function tupleFixture(): Record<string, unknown> {
  return {
    schema: 'folklore.model-provenance-tuple.v1',
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    role: 'generate',
    modelId: 'provider/model-v1',
    modelRevision: 'revision-1',
    modelArtifactDigest: DIGEST,
  };
}

function providerBindingFixture(): Record<string, unknown> {
  return {
    schema: 'folklore.provider-native-model-artifact-binding.v1',
    source: 'provider-native',
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    role: 'generate',
    sessionId: 'session-1',
    workloadKeysetDigest: 'b'.repeat(64),
    modelId: 'provider/model-v1',
    modelRevision: 'revision-1',
    modelArtifactDigest: DIGEST,
    issuerWorkloadId: 'issuer-workload-1',
    workloadArtifactDigest: 'c'.repeat(64),
    nativeEvidenceDigest: 'd'.repeat(64),
    routeIdentityDigest: 'e'.repeat(64),
  };
}

function controlledBindingFixture(): Record<string, unknown> {
  return {
    schema: 'folklore.controlled-gateway-model-artifact-binding.v1',
    source: 'controlled-gateway',
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    role: 'generate',
    proofId: 'proof-1',
    requestId: 'request-1',
    sessionId: 'session-1',
    workloadId: 'workload-1',
    workloadKeysetDigest: 'b'.repeat(64),
    modelId: 'provider/model-v1',
    modelRevision: 'revision-1',
    modelArtifactDigest: DIGEST,
    routeIdentityDigest: 'e'.repeat(64),
    proofDigest: 'f'.repeat(64),
    policyGeneration: 7,
    activationGeneration: 3,
  };
}

function productionFixture(
  source: 'provider-native' | 'controlled-gateway' = 'controlled-gateway',
): Record<string, unknown> {
  const providerNative = source === 'provider-native';
  return {
    schema: 'folklore.production-verified-model-provenance.v1',
    status: 'verified',
    executionMode: 'production',
    source,
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    role: 'generate',
    modelId: 'provider/model-v1',
    modelRevision: 'revision-1',
    modelArtifactDigest: DIGEST,
    tupleDigest: '1'.repeat(64),
    bindingDigest: '2'.repeat(64),
    policyDigest: '3'.repeat(64),
    policyGeneration: 7,
    activationGeneration: 3,
    sessionId: 'session-1',
    workloadKeysetDigest: 'b'.repeat(64),
    proofDigest: providerNative ? null : 'f'.repeat(64),
    nativeEvidenceDigest: providerNative ? 'd'.repeat(64) : null,
    routeIdentityDigest: 'e'.repeat(64),
  };
}

function syntheticFixture(): Record<string, unknown> {
  return {
    ...productionFixture('controlled-gateway'),
    schema: 'folklore.synthetic-verified-model-provenance.v1',
    executionMode: 'synthetic',
  };
}

function expectSchemaAccepts(
  schema: z.ZodTypeAny,
  cases: readonly [label: string, value: unknown][],
): void {
  for (const [label, value] of cases) {
    expect(schema.safeParse(value).success, label).toBe(true);
  }
}

function expectSchemaRejects(
  schema: z.ZodTypeAny,
  cases: readonly [label: string, value: unknown][],
): void {
  for (const [label, value] of cases) {
    expect(schema.safeParse(value).success, label).toBe(false);
  }
}

function missingEach(schema: z.ZodTypeAny, fixture: Record<string, unknown>): void {
  const cases: [label: string, value: unknown][] = Object.keys(fixture).map((key) => {
    const { [key]: _omitted, ...rest } = fixture;
    return [`missing-${key}`, rest];
  });
  expectSchemaRejects(schema, cases);
}

function extraField(schema: z.ZodTypeAny, fixture: Record<string, unknown>): void {
  expectSchemaRejects(schema, [['extra-field', { ...fixture, extra: 'value' }]]);
}

function emptyIdentity(schema: z.ZodTypeAny, fixture: Record<string, unknown>): void {
  expectSchemaRejects(schema, [
    ['empty-org', { ...fixture, orgId: '' }],
    ['empty-deployment', { ...fixture, deploymentId: '' }],
    ['empty-revision', { ...fixture, modelRevision: '' }],
  ]);
}

function invalidDigests(schema: z.ZodTypeAny, fixture: Record<string, unknown>): void {
  expectSchemaRejects(schema, [
    ['short-digest', { ...fixture, modelArtifactDigest: 'a'.repeat(63) }],
    ['long-digest', { ...fixture, modelArtifactDigest: 'a'.repeat(65) }],
    ['uppercase-digest', { ...fixture, modelArtifactDigest: 'A'.repeat(64) }],
    ['non-hex-digest', { ...fixture, modelArtifactDigest: 'g'.repeat(64) }],
  ]);
}

describe('model provenance enum schemas', () => {
  it('accepts exactly the three source, status, and execution mode literals', () => {
    expectSchemaAccepts(modelProvenanceSourceV1Schema, [
      ['provider-native', 'provider-native'],
      ['controlled-gateway', 'controlled-gateway'],
    ]);
    expectSchemaRejects(modelProvenanceSourceV1Schema, [
      ['unknown-source', 'unknown'],
      ['empty-source', ''],
    ]);
    expectSchemaAccepts(modelProvenanceStatusV1Schema, [
      ['unknown', 'unknown'],
      ['verified', 'verified'],
    ]);
    expectSchemaRejects(modelProvenanceStatusV1Schema, [['invalid-status', 'confirmed']]);
    expectSchemaAccepts(modelExecutionModeV1Schema, [
      ['production', 'production'],
      ['synthetic', 'synthetic'],
    ]);
    expectSchemaRejects(modelExecutionModeV1Schema, [['invalid-mode', 'staging']]);
  });
});

describe('policy signed model provenance tuple schema', () => {
  const schema = policySignedModelProvenanceTupleV1Schema;

  it('accepts a valid tuple', () => {
    expectSchemaAccepts(schema, [['tuple', tupleFixture()]]);
  });

  it('rejects missing, extra, empty, and malformed fields', () => {
    missingEach(schema, tupleFixture());
    extraField(schema, tupleFixture());
    emptyIdentity(schema, tupleFixture());
    invalidDigests(schema, tupleFixture());
  });

  it('rejects one invalid mutation per tuple field', () => {
    expectSchemaRejects(schema, [
      ['schema', { ...tupleFixture(), schema: 'folklore.model-provenance-tuple.v2' }],
      ['orgId', { ...tupleFixture(), orgId: ' org-1' }],
      ['deploymentId', { ...tupleFixture(), deploymentId: '/deployment-1' }],
      ['role', { ...tupleFixture(), role: 'generate-2' }],
      ['modelId', { ...tupleFixture(), modelId: 'model-v1' }],
      ['modelRevision', { ...tupleFixture(), modelRevision: 'revision-1 ' }],
      ['modelArtifactDigest', { ...tupleFixture(), modelArtifactDigest: 'b'.repeat(63) }],
    ]);
  });

  it('accepts tagged model aliases as distinct model identifiers', () => {
    expectSchemaAccepts(schema, [
      ['base-model', tupleFixture()],
      ['latest-tag', { ...tupleFixture(), modelId: 'provider/model-v1:latest' }],
    ]);
  });
});

describe('provider-native model artifact binding schema', () => {
  const schema = providerNativeModelArtifactBindingV1Schema;

  it('accepts a valid provider-native binding', () => {
    expectSchemaAccepts(schema, [['binding', providerBindingFixture()]]);
  });

  it('rejects a non-provider-native source literal', () => {
    expectSchemaRejects(schema, [
      ['controlled-source', { ...providerBindingFixture(), source: 'controlled-gateway' }],
      ['unknown-source', { ...providerBindingFixture(), source: 'unknown' }],
    ]);
  });

  it('rejects missing, extra, empty, and malformed fields', () => {
    missingEach(schema, providerBindingFixture());
    extraField(schema, providerBindingFixture());
    emptyIdentity(schema, providerBindingFixture());
    invalidDigests(schema, providerBindingFixture());
  });

  it('rejects one invalid mutation per provider-native binding field', () => {
    expectSchemaRejects(schema, [
      ['schema', { ...providerBindingFixture(), schema: 'folklore.provider-native-binding.v2' }],
      ['source', { ...providerBindingFixture(), source: 'controlled-gateway' }],
      ['orgId', { ...providerBindingFixture(), orgId: '' }],
      ['deploymentId', { ...providerBindingFixture(), deploymentId: '' }],
      ['role', { ...providerBindingFixture(), role: 'embedder' }],
      ['sessionId', { ...providerBindingFixture(), sessionId: '' }],
      [
        'workloadKeysetDigest',
        { ...providerBindingFixture(), workloadKeysetDigest: 'x'.repeat(64) },
      ],
      ['modelId', { ...providerBindingFixture(), modelId: 'provider/' }],
      ['modelRevision', { ...providerBindingFixture(), modelRevision: '' }],
      ['modelArtifactDigest', { ...providerBindingFixture(), modelArtifactDigest: 'b'.repeat(63) }],
      ['issuerWorkloadId', { ...providerBindingFixture(), issuerWorkloadId: '' }],
      [
        'workloadArtifactDigest',
        { ...providerBindingFixture(), workloadArtifactDigest: 'c'.repeat(63) },
      ],
      [
        'nativeEvidenceDigest',
        { ...providerBindingFixture(), nativeEvidenceDigest: 'd'.repeat(63) },
      ],
      ['routeIdentityDigest', { ...providerBindingFixture(), routeIdentityDigest: 'e'.repeat(63) }],
    ]);
  });
});

describe('controlled-gateway model artifact binding schema', () => {
  const schema = controlledGatewayModelArtifactBindingV1Schema;

  it('accepts a valid controlled-gateway binding', () => {
    expectSchemaAccepts(schema, [['binding', controlledBindingFixture()]]);
  });

  it('rejects a non-controlled-gateway source literal', () => {
    expectSchemaRejects(schema, [
      ['provider-source', { ...controlledBindingFixture(), source: 'provider-native' }],
      ['unknown-source', { ...controlledBindingFixture(), source: 'unknown' }],
    ]);
  });

  it('rejects missing, extra, empty, and malformed fields', () => {
    missingEach(schema, controlledBindingFixture());
    extraField(schema, controlledBindingFixture());
    emptyIdentity(schema, controlledBindingFixture());
    invalidDigests(schema, controlledBindingFixture());
  });

  it('rejects invalid generation numbers', () => {
    expectSchemaRejects(schema, [
      ['zero-policy-generation', { ...controlledBindingFixture(), policyGeneration: 0 }],
      ['fractional-policy-generation', { ...controlledBindingFixture(), policyGeneration: 1.5 }],
      [
        'negative-activation-generation',
        { ...controlledBindingFixture(), activationGeneration: -1 },
      ],
    ]);
  });

  it('rejects one invalid mutation per controlled binding field', () => {
    expectSchemaRejects(schema, [
      ['schema', { ...controlledBindingFixture(), schema: 'folklore.controlled-binding.v2' }],
      ['source', { ...controlledBindingFixture(), source: 'provider-native' }],
      ['orgId', { ...controlledBindingFixture(), orgId: '' }],
      ['deploymentId', { ...controlledBindingFixture(), deploymentId: '' }],
      ['role', { ...controlledBindingFixture(), role: 'embedder' }],
      ['proofId', { ...controlledBindingFixture(), proofId: '' }],
      ['requestId', { ...controlledBindingFixture(), requestId: '' }],
      ['sessionId', { ...controlledBindingFixture(), sessionId: '' }],
      ['workloadId', { ...controlledBindingFixture(), workloadId: '' }],
      [
        'workloadKeysetDigest',
        { ...controlledBindingFixture(), workloadKeysetDigest: 'x'.repeat(64) },
      ],
      ['modelId', { ...controlledBindingFixture(), modelId: 'provider/' }],
      ['modelRevision', { ...controlledBindingFixture(), modelRevision: '' }],
      [
        'modelArtifactDigest',
        { ...controlledBindingFixture(), modelArtifactDigest: 'b'.repeat(63) },
      ],
      [
        'routeIdentityDigest',
        { ...controlledBindingFixture(), routeIdentityDigest: 'c'.repeat(63) },
      ],
      ['proofDigest', { ...controlledBindingFixture(), proofDigest: 'd'.repeat(63) }],
      ['policyGeneration', { ...controlledBindingFixture(), policyGeneration: 0 }],
      ['activationGeneration', { ...controlledBindingFixture(), activationGeneration: 0 }],
    ]);
  });
});

describe('production verified model provenance schema', () => {
  const schema = productionVerifiedModelProvenanceV1Schema;

  it('accepts valid production decisions for both sources', () => {
    expectSchemaAccepts(schema, [
      ['controlled-gateway', productionFixture('controlled-gateway')],
      ['provider-native', productionFixture('provider-native')],
    ]);
  });

  it('rejects unknown evidence and mode mismatches', () => {
    expectSchemaRejects(schema, [
      ['unknown-status', { ...productionFixture(), status: 'unknown' }],
      ['synthetic-mode', { ...productionFixture(), executionMode: 'synthetic' }],
      ['unknown-source', { ...productionFixture(), source: 'unknown' }],
    ]);
  });

  it('enforces the exact source-specific identity rule', () => {
    expectSchemaRejects(schema, [
      [
        'provider-native-with-proof',
        {
          ...productionFixture('provider-native'),
          proofDigest: 'f'.repeat(64),
          nativeEvidenceDigest: 'd'.repeat(64),
        },
      ],
      [
        'provider-native-without-evidence',
        { ...productionFixture('provider-native'), nativeEvidenceDigest: null },
      ],
      [
        'controlled-with-native-evidence',
        {
          ...productionFixture('controlled-gateway'),
          nativeEvidenceDigest: 'd'.repeat(64),
          proofDigest: 'f'.repeat(64),
        },
      ],
      [
        'controlled-without-proof',
        { ...productionFixture('controlled-gateway'), proofDigest: null },
      ],
    ]);
  });

  it('rejects missing, extra, empty, and malformed fields', () => {
    missingEach(schema, productionFixture());
    extraField(schema, productionFixture());
    emptyIdentity(schema, productionFixture());
    invalidDigests(schema, productionFixture());
    expectSchemaRejects(schema, [
      ['short-tuple-digest', { ...productionFixture(), tupleDigest: '1'.repeat(63) }],
      ['short-binding-digest', { ...productionFixture(), bindingDigest: '2'.repeat(63) }],
      ['short-policy-digest', { ...productionFixture(), policyDigest: '3'.repeat(63) }],
      ['short-route-digest', { ...productionFixture(), routeIdentityDigest: 'e'.repeat(63) }],
      ['zero-policy-generation', { ...productionFixture(), policyGeneration: 0 }],
      ['zero-activation-generation', { ...productionFixture(), activationGeneration: 0 }],
    ]);
  });
});

describe('synthetic verified model provenance schema', () => {
  const schema = syntheticVerifiedModelProvenanceV1Schema;

  it('accepts a valid synthetic decision', () => {
    expectSchemaAccepts(schema, [['synthetic', syntheticFixture()]]);
  });

  it('rejects production mode and unknown evidence', () => {
    expectSchemaRejects(schema, [
      ['production-mode', { ...syntheticFixture(), executionMode: 'production' }],
      ['unknown-status', { ...syntheticFixture(), status: 'unknown' }],
    ]);
  });

  it('enforces the exact source-specific identity rule', () => {
    expectSchemaRejects(schema, [
      [
        'provider-native-with-proof',
        { ...syntheticFixture(), source: 'provider-native', proofDigest: 'f'.repeat(64) },
      ],
      ['controlled-without-proof', { ...syntheticFixture(), proofDigest: null }],
    ]);
  });

  it('rejects missing and extra fields', () => {
    missingEach(schema, syntheticFixture());
    extraField(schema, syntheticFixture());
  });
});

describe('unknown model provenance schema', () => {
  const schema = unknownModelProvenanceV1Schema;

  it('accepts the unknown projection', () => {
    expectSchemaAccepts(schema, [
      ['unknown', { schema: 'folklore.unknown-model-provenance.v1', status: 'unknown' }],
    ]);
  });

  it('rejects extra fields and wrong literals', () => {
    expectSchemaRejects(schema, [
      [
        'extra-field',
        {
          schema: 'folklore.unknown-model-provenance.v1',
          status: 'unknown',
          source: 'provider-native',
        },
      ],
      ['wrong-schema', { schema: 'folklore.unknown-model-provenance.v2', status: 'unknown' }],
      ['wrong-status', { schema: 'folklore.unknown-model-provenance.v1', status: 'verified' }],
      ['missing-status', { schema: 'folklore.unknown-model-provenance.v1' }],
    ]);
  });
});

describe('verified model provenance union schema', () => {
  const schema = verifiedModelProvenanceV1Schema;

  it('accepts production and synthetic verified projections', () => {
    expectSchemaAccepts(schema, [
      ['production', productionFixture('controlled-gateway')],
      ['synthetic', syntheticFixture()],
    ]);
  });

  it('rejects unknown provenance, plain objects, and cast-shaped lookalikes', () => {
    expectSchemaRejects(schema, [
      ['unknown', { schema: 'folklore.unknown-model-provenance.v1', status: 'unknown' }],
      ['empty-object', {}],
      ['status-only', { status: 'verified' }],
      ['schema-only', { schema: 'folklore.production-verified-model-provenance.v1' }],
    ]);
  });
});

describe('model provenance runtime guards', () => {
  it('is* guards accept only structurally exact values', () => {
    expect(isPolicySignedModelProvenanceTupleV1(tupleFixture())).toBe(true);
    expect(isPolicySignedModelProvenanceTupleV1({ ...tupleFixture(), extra: 'x' })).toBe(false);
    expect(isProviderNativeModelArtifactBindingV1(providerBindingFixture())).toBe(true);
    expect(isProviderNativeModelArtifactBindingV1(controlledBindingFixture())).toBe(false);
    expect(isControlledGatewayModelArtifactBindingV1(controlledBindingFixture())).toBe(true);
    expect(isControlledGatewayModelArtifactBindingV1(providerBindingFixture())).toBe(false);
    expect(isProductionVerifiedModelProvenanceV1(productionFixture())).toBe(true);
    expect(isProductionVerifiedModelProvenanceV1(syntheticFixture())).toBe(false);
    expect(isSyntheticVerifiedModelProvenanceV1(syntheticFixture())).toBe(true);
    expect(isSyntheticVerifiedModelProvenanceV1(productionFixture())).toBe(false);
    expect(
      isUnknownModelProvenanceV1({
        schema: 'folklore.unknown-model-provenance.v1',
        status: 'unknown',
      }),
    ).toBe(true);
    expect(isUnknownModelProvenanceV1(productionFixture())).toBe(false);
    expect(isVerifiedModelProvenanceV1(productionFixture())).toBe(true);
    expect(isVerifiedModelProvenanceV1(syntheticFixture())).toBe(true);
    expect(
      isVerifiedModelProvenanceV1({
        schema: 'folklore.unknown-model-provenance.v1',
        status: 'unknown',
      }),
    ).toBe(false);
  });

  it('assert* guards throw only on structural mismatch', () => {
    expect(() => assertPolicySignedModelProvenanceTupleV1(tupleFixture())).not.toThrow();
    expect(() => assertPolicySignedModelProvenanceTupleV1({})).toThrow();
    expect(() =>
      assertProviderNativeModelArtifactBindingV1(providerBindingFixture()),
    ).not.toThrow();
    expect(() => assertProviderNativeModelArtifactBindingV1({})).toThrow();
    expect(() =>
      assertControlledGatewayModelArtifactBindingV1(controlledBindingFixture()),
    ).not.toThrow();
    expect(() => assertControlledGatewayModelArtifactBindingV1({})).toThrow();
    expect(() => assertProductionVerifiedModelProvenanceV1(productionFixture())).not.toThrow();
    expect(() => assertProductionVerifiedModelProvenanceV1({})).toThrow();
    expect(() => assertSyntheticVerifiedModelProvenanceV1(syntheticFixture())).not.toThrow();
    expect(() => assertSyntheticVerifiedModelProvenanceV1({})).toThrow();
    expect(() =>
      assertUnknownModelProvenanceV1({
        schema: 'folklore.unknown-model-provenance.v1',
        status: 'unknown',
      }),
    ).not.toThrow();
    expect(() => assertUnknownModelProvenanceV1({})).toThrow();
    expect(() => assertVerifiedModelProvenanceV1(productionFixture())).not.toThrow();
    expect(() => assertVerifiedModelProvenanceV1({})).toThrow();
  });
});

describe('model provenance contract surface', () => {
  it('exposes no provenance result constructor or mint', async () => {
    const surface = await import('../src/model-provenance.js');
    const names = Object.keys(surface);
    expect(names.some((name) => /mint|create|constructor|unsafe/i.test(name))).toBe(false);
  });
});

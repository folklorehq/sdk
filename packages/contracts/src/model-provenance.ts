// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { inferenceModelRoleSchema } from './inference-trust.js';
import { digest64Schema, identifierSchema } from './shared.js';

export const modelProvenanceSourceV1Schema = z.enum(['provider-native', 'controlled-gateway']);
export type ModelProvenanceSourceV1 = z.infer<typeof modelProvenanceSourceV1Schema>;

export const modelProvenanceStatusV1Schema = z.enum(['unknown', 'verified']);
export type ModelProvenanceStatusV1 = z.infer<typeof modelProvenanceStatusV1Schema>;

export const modelExecutionModeV1Schema = z.enum(['production', 'synthetic']);
export type ModelExecutionModeV1 = z.infer<typeof modelExecutionModeV1Schema>;

const modelProvenanceModelIdSchema = z
  .string()
  .min(3)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const provenanceGenerationSchema = z.number().int().safe().positive();
const nullableDigest64Schema = z.union([digest64Schema, z.null()]);

export const policySignedModelProvenanceTupleV1Schema = z
  .object({
    schema: z.literal('folklore.model-provenance-tuple.v1'),
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    role: inferenceModelRoleSchema,
    modelId: modelProvenanceModelIdSchema,
    modelRevision: identifierSchema,
    modelArtifactDigest: digest64Schema,
  })
  .strict();
export type PolicySignedModelProvenanceTupleV1 = z.infer<
  typeof policySignedModelProvenanceTupleV1Schema
>;

export const providerNativeModelArtifactBindingV1Schema = z
  .object({
    schema: z.literal('folklore.provider-native-model-artifact-binding.v1'),
    source: z.literal('provider-native'),
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    role: inferenceModelRoleSchema,
    sessionId: identifierSchema,
    workloadKeysetDigest: digest64Schema,
    modelId: modelProvenanceModelIdSchema,
    modelRevision: identifierSchema,
    modelArtifactDigest: digest64Schema,
    issuerWorkloadId: identifierSchema,
    workloadArtifactDigest: digest64Schema,
    nativeEvidenceDigest: digest64Schema,
    routeIdentityDigest: digest64Schema,
  })
  .strict();
export type ProviderNativeModelArtifactBindingV1 = z.infer<
  typeof providerNativeModelArtifactBindingV1Schema
>;

export const controlledGatewayModelArtifactBindingV1Schema = z
  .object({
    schema: z.literal('folklore.controlled-gateway-model-artifact-binding.v1'),
    source: z.literal('controlled-gateway'),
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    role: inferenceModelRoleSchema,
    proofId: identifierSchema,
    requestId: identifierSchema,
    sessionId: identifierSchema,
    workloadId: identifierSchema,
    workloadKeysetDigest: digest64Schema,
    modelId: modelProvenanceModelIdSchema,
    modelRevision: identifierSchema,
    modelArtifactDigest: digest64Schema,
    routeIdentityDigest: digest64Schema,
    proofDigest: digest64Schema,
    policyGeneration: provenanceGenerationSchema,
    activationGeneration: provenanceGenerationSchema,
  })
  .strict();
export type ControlledGatewayModelArtifactBindingV1 = z.infer<
  typeof controlledGatewayModelArtifactBindingV1Schema
>;

const verifiedModelProvenanceFields = {
  status: z.literal('verified'),
  source: modelProvenanceSourceV1Schema,
  orgId: identifierSchema,
  deploymentId: identifierSchema,
  role: inferenceModelRoleSchema,
  modelId: modelProvenanceModelIdSchema,
  modelRevision: identifierSchema,
  modelArtifactDigest: digest64Schema,
  tupleDigest: digest64Schema,
  bindingDigest: digest64Schema,
  policyDigest: digest64Schema,
  policyGeneration: provenanceGenerationSchema,
  activationGeneration: provenanceGenerationSchema,
  sessionId: identifierSchema,
  workloadKeysetDigest: digest64Schema,
  proofDigest: nullableDigest64Schema,
  nativeEvidenceDigest: nullableDigest64Schema,
  routeIdentityDigest: digest64Schema,
};

// Provider-native decisions carry native evidence identity and no proof; controlled-gateway
// decisions carry proof identity and no native evidence. Any mix fails closed (plan Task 1).
function enforceSourceSpecificIdentity(value: {
  source: ModelProvenanceSourceV1;
  proofDigest: string | null;
  nativeEvidenceDigest: string | null;
}): boolean {
  if (value.source === 'provider-native') {
    return value.proofDigest === null && value.nativeEvidenceDigest !== null;
  }
  return value.proofDigest !== null && value.nativeEvidenceDigest === null;
}

export const productionVerifiedModelProvenanceV1Schema = z
  .object({
    schema: z.literal('folklore.production-verified-model-provenance.v1'),
    executionMode: z.literal('production'),
    ...verifiedModelProvenanceFields,
  })
  .strict()
  .refine(enforceSourceSpecificIdentity, {
    message: 'source-specific provenance identity mismatch',
  });
export type ProductionVerifiedModelProvenanceV1 = z.infer<
  typeof productionVerifiedModelProvenanceV1Schema
>;

export const syntheticVerifiedModelProvenanceV1Schema = z
  .object({
    schema: z.literal('folklore.synthetic-verified-model-provenance.v1'),
    executionMode: z.literal('synthetic'),
    ...verifiedModelProvenanceFields,
  })
  .strict()
  .refine(enforceSourceSpecificIdentity, {
    message: 'source-specific provenance identity mismatch',
  });
export type SyntheticVerifiedModelProvenanceV1 = z.infer<
  typeof syntheticVerifiedModelProvenanceV1Schema
>;

export const unknownModelProvenanceV1Schema = z
  .object({
    schema: z.literal('folklore.unknown-model-provenance.v1'),
    status: z.literal('unknown'),
  })
  .strict();
export type UnknownModelProvenanceV1 = z.infer<typeof unknownModelProvenanceV1Schema>;

export const verifiedModelProvenanceV1Schema = z.union([
  productionVerifiedModelProvenanceV1Schema,
  syntheticVerifiedModelProvenanceV1Schema,
]);
export type VerifiedModelProvenanceV1 =
  | ProductionVerifiedModelProvenanceV1
  | SyntheticVerifiedModelProvenanceV1;

export function isPolicySignedModelProvenanceTupleV1(
  value: unknown,
): value is PolicySignedModelProvenanceTupleV1 {
  return policySignedModelProvenanceTupleV1Schema.safeParse(value).success;
}

export function assertPolicySignedModelProvenanceTupleV1(
  value: unknown,
): asserts value is PolicySignedModelProvenanceTupleV1 {
  if (!isPolicySignedModelProvenanceTupleV1(value)) {
    throw new Error('invalid_model_provenance_tuple');
  }
}

export function isProviderNativeModelArtifactBindingV1(
  value: unknown,
): value is ProviderNativeModelArtifactBindingV1 {
  return providerNativeModelArtifactBindingV1Schema.safeParse(value).success;
}

export function assertProviderNativeModelArtifactBindingV1(
  value: unknown,
): asserts value is ProviderNativeModelArtifactBindingV1 {
  if (!isProviderNativeModelArtifactBindingV1(value)) {
    throw new Error('invalid_provider_native_model_artifact_binding');
  }
}

export function isControlledGatewayModelArtifactBindingV1(
  value: unknown,
): value is ControlledGatewayModelArtifactBindingV1 {
  return controlledGatewayModelArtifactBindingV1Schema.safeParse(value).success;
}

export function assertControlledGatewayModelArtifactBindingV1(
  value: unknown,
): asserts value is ControlledGatewayModelArtifactBindingV1 {
  if (!isControlledGatewayModelArtifactBindingV1(value)) {
    throw new Error('invalid_controlled_gateway_model_artifact_binding');
  }
}

export function isProductionVerifiedModelProvenanceV1(
  value: unknown,
): value is ProductionVerifiedModelProvenanceV1 {
  return productionVerifiedModelProvenanceV1Schema.safeParse(value).success;
}

export function assertProductionVerifiedModelProvenanceV1(
  value: unknown,
): asserts value is ProductionVerifiedModelProvenanceV1 {
  if (!isProductionVerifiedModelProvenanceV1(value)) {
    throw new Error('invalid_production_verified_model_provenance');
  }
}

export function isSyntheticVerifiedModelProvenanceV1(
  value: unknown,
): value is SyntheticVerifiedModelProvenanceV1 {
  return syntheticVerifiedModelProvenanceV1Schema.safeParse(value).success;
}

export function assertSyntheticVerifiedModelProvenanceV1(
  value: unknown,
): asserts value is SyntheticVerifiedModelProvenanceV1 {
  if (!isSyntheticVerifiedModelProvenanceV1(value)) {
    throw new Error('invalid_synthetic_verified_model_provenance');
  }
}

export function isUnknownModelProvenanceV1(value: unknown): value is UnknownModelProvenanceV1 {
  return unknownModelProvenanceV1Schema.safeParse(value).success;
}

export function assertUnknownModelProvenanceV1(
  value: unknown,
): asserts value is UnknownModelProvenanceV1 {
  if (!isUnknownModelProvenanceV1(value)) {
    throw new Error('invalid_unknown_model_provenance');
  }
}

export function isVerifiedModelProvenanceV1(value: unknown): value is VerifiedModelProvenanceV1 {
  return verifiedModelProvenanceV1Schema.safeParse(value).success;
}

export function assertVerifiedModelProvenanceV1(
  value: unknown,
): asserts value is VerifiedModelProvenanceV1 {
  if (!isVerifiedModelProvenanceV1(value)) {
    throw new Error('invalid_verified_model_provenance');
  }
}

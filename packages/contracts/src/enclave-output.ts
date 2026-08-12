// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const ENCLAVE_OUTPUT_VERSION = 1 as const;
const NONCE_PATTERN = /^[0-9a-f]{64}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SIGNATURE_PATTERN = /^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/][AQgw]==$/;

export const enclaveOutputTypeSchema = z.enum([
  'processed_fact',
  'pull_complete',
  'pull_failed',
  'wiki_synthesis',
  'theme_synthesis',
  'team_onboarding_synthesis',
]);
export type EnclaveOutputType = z.infer<typeof enclaveOutputTypeSchema>;

const outputBindingFields = {
  outputType: enclaveOutputTypeSchema,
  orgId: z.string().min(1),
  deploymentId: z.string().min(1),
  assignmentGeneration: z.number().int().positive().safe(),
  outputId: z.string().min(1),
  nonce: z.string().regex(NONCE_PATTERN),
  resourceIds: z.array(z.string().min(1)),
  payload: z.unknown(),
};

function requireCanonicalResourceIds(
  value: { resourceIds: string[] },
  context: z.RefinementCtx,
): void {
  const sorted = [...value.resourceIds].sort();
  if (sorted.some((id, index) => id !== value.resourceIds[index])) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'resource IDs must be sorted',
      path: ['resourceIds'],
    });
  }
  if (new Set(value.resourceIds).size !== value.resourceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'resource IDs must be unique',
      path: ['resourceIds'],
    });
  }
}

export const enclaveOutputBindingSchema = z
  .object(outputBindingFields)
  .strict()
  .superRefine(requireCanonicalResourceIds);

const authenticatorSchema = z
  .object({
    keyId: z.string().min(1),
    algorithm: z.literal('Ed25519'),
    signature: z.string().regex(SIGNATURE_PATTERN),
  })
  .strict();

export const enclaveOutputEnvelopeSchema = z
  .object({
    ...outputBindingFields,
    version: z.literal(ENCLAVE_OUTPUT_VERSION),
    payloadDigest: z.string().regex(DIGEST_PATTERN),
    authenticator: authenticatorSchema,
  })
  .strict()
  .superRefine(requireCanonicalResourceIds);
export type EnclaveOutputEnvelope = z.infer<typeof enclaveOutputEnvelopeSchema>;
export type EnclaveOutputBinding = z.infer<typeof enclaveOutputBindingSchema>;

export interface EnclaveOutputIdentity {
  deploymentId: string;
  assignmentGeneration: number;
}

export interface EnclaveOutputAuthenticator {
  sign(input: EnclaveOutputBinding): EnclaveOutputEnvelope;
  verify(input: unknown): boolean;
}

export function enclaveOutputBindingForPayload(
  payload: unknown,
  identity: EnclaveOutputIdentity & { nonce: string },
): EnclaveOutputBinding {
  if (!isRecord(payload)) throw new Error('enclave_output_payload_invalid');
  const type = typeof payload['type'] === 'string' ? payload['type'] : undefined;
  if (type === 'pull-complete') {
    return outputBinding({
      outputType: 'pull_complete',
      outputId: `${requiredString(payload, 'sourceId')}:${requiredString(payload, 'completedAt')}`,
      resourceIds: [requiredString(payload, 'sourceId')],
      payload,
      identity,
    });
  }
  if (type === 'pull-failed') {
    return outputBinding({
      outputType: 'pull_failed',
      outputId: `${requiredString(payload, 'sourceId')}:${requiredString(payload, 'failedAt')}`,
      resourceIds: [requiredString(payload, 'sourceId')],
      payload,
      identity,
    });
  }
  if (type === 'wiki_synthesis') {
    return outputBinding({
      outputType: 'wiki_synthesis',
      outputId: requiredString(payload, 'requestId'),
      resourceIds: [
        requiredString(payload, 'themeId'),
        ...requiredStringArray(payload, 'citedFactIds'),
      ],
      payload,
      identity,
    });
  }
  if (type === 'team_onboarding_synthesis') {
    return outputBinding({
      outputType: 'team_onboarding_synthesis',
      outputId: requiredString(payload, 'requestId'),
      resourceIds: [
        requiredString(payload, 'teamId'),
        ...requiredStringArray(payload, 'citedFactIds'),
      ],
      payload,
      identity,
    });
  }
  if (type === 'theme_synthesis') {
    const themes = requiredRecordArray(payload, 'themes');
    const resourceIds = themes.flatMap((theme) => [
      requiredString(theme, 'themeId'),
      ...requiredRecordArray(theme, 'facts').map((fact) => requiredString(fact, 'factId')),
    ]);
    return outputBinding({
      outputType: 'theme_synthesis',
      outputId: requiredString(payload, 'requestId'),
      resourceIds,
      payload,
      identity,
    });
  }
  if (type !== undefined) throw new Error('enclave_output_type_invalid');
  return outputBinding({
    outputType: 'processed_fact',
    outputId: requiredString(payload, 'factId'),
    resourceIds: [requiredString(payload, 'factId')],
    payload,
    identity,
  });
}

function outputBinding(input: {
  outputType: EnclaveOutputType;
  outputId: string;
  resourceIds: string[];
  payload: unknown;
  identity: EnclaveOutputIdentity & { nonce: string };
}): EnclaveOutputBinding {
  return enclaveOutputBindingSchema.parse({
    outputType: input.outputType,
    orgId: requiredStringFromPayload(input.payload, 'orgId'),
    deploymentId: input.identity.deploymentId,
    assignmentGeneration: input.identity.assignmentGeneration,
    outputId: input.outputId,
    nonce: input.identity.nonce,
    resourceIds: [...new Set(input.resourceIds)].sort(),
    payload: input.payload,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('enclave_output_field_invalid');
  return value;
}

function requiredStringFromPayload(payload: unknown, key: string): string {
  if (!isRecord(payload)) throw new Error('enclave_output_payload_invalid');
  return requiredString(payload, key);
}

function requiredStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key];
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error('enclave_output_field_invalid');
  }
  return [...value] as string[];
}

function requiredRecordArray(
  payload: Record<string, unknown>,
  key: string,
): Record<string, unknown>[] {
  const value = payload[key];
  if (!Array.isArray(value) || value.some((item) => !isRecord(item))) {
    throw new Error('enclave_output_field_invalid');
  }
  return value as Record<string, unknown>[];
}

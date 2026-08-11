// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_MODEL_ID_LENGTH = 256;
const MAX_ROUTE_LENGTH = 2_048;
const MAX_POLICY_ITEMS = 32;
const identifierSchema = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const measurementSchema = z.string().regex(/^[0-9a-f]{96}$/);
const rawEd25519PublicKeySchema = z
  .string()
  .length(44)
  .regex(/^[A-Za-z0-9+/]{43}=$/);
const ed25519SignatureSchema = z
  .string()
  .length(88)
  .regex(/^[A-Za-z0-9+/]{86}==$/);
const nonceSchema = rawEd25519PublicKeySchema;
const positiveSafeIntegerSchema = z.number().int().safe().positive();
const providerModelSchema = z
  .string()
  .min(3)
  .max(MAX_MODEL_ID_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const routeSchema = z
  .string()
  .min(1)
  .max(MAX_ROUTE_LENGTH)
  .regex(
    /^\/(?:[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?$/,
  );

function isExactHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.origin === value
    );
  } catch {
    return false;
  }
}

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return index === 0 || (previous !== undefined && previous < value);
  });
}

function addSortedIssue(
  context: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  context.addIssue({ code: z.ZodIssueCode.custom, message, path });
}

const exactHttpsOriginSchema = z.string().min(1).max(2_048).refine(isExactHttpsOrigin);

const receiptKeySchema = z
  .object({
    keyId: identifierSchema,
    algorithm: z.literal('Ed25519'),
    publicKey: rawEd25519PublicKeySchema,
  })
  .strict();

const permittedModelSchema = z
  .object({
    model: providerModelSchema,
    revision: identifierSchema,
  })
  .strict();

export const inferenceTrustPolicyV1Schema = z
  .object({
    version: z.literal(1),
    generation: positiveSafeIntegerSchema,
    origin: exactHttpsOriginSchema,
    route: routeSchema,
    redirectOrigins: z.array(exactHttpsOriginSchema).max(MAX_POLICY_ITEMS),
    workloadId: identifierSchema,
    quoteRootDigests: z.array(digestSchema).min(1).max(MAX_POLICY_ITEMS),
    workloadMeasurements: z.array(measurementSchema).min(1).max(MAX_POLICY_ITEMS),
    receiptKeys: z.array(receiptKeySchema).min(1).max(MAX_POLICY_ITEMS),
    permittedModels: z.array(permittedModelSchema).min(1).max(MAX_POLICY_ITEMS),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!sortedUnique(policy.redirectOrigins)) {
      addSortedIssue(context, ['redirectOrigins'], 'redirect origins must be sorted and unique');
    }
    if (!sortedUnique(policy.quoteRootDigests)) {
      addSortedIssue(context, ['quoteRootDigests'], 'quote roots must be sorted and unique');
    }
    if (!sortedUnique(policy.workloadMeasurements)) {
      addSortedIssue(
        context,
        ['workloadMeasurements'],
        'workload measurements must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.receiptKeys.map((key) => key.keyId))) {
      addSortedIssue(context, ['receiptKeys'], 'receipt keys must be sorted and unique');
    }
    if (
      !sortedUnique(policy.permittedModels.map((model) => `${model.model}\u0000${model.revision}`))
    ) {
      addSortedIssue(context, ['permittedModels'], 'permitted models must be sorted and unique');
    }
  });
export type InferenceTrustPolicyV1 = z.infer<typeof inferenceTrustPolicyV1Schema>;

export const inferenceReceiptV1Schema = z
  .object({
    version: z.literal(1),
    requestSha256: digestSchema,
    responseSha256: digestSchema,
    model: providerModelSchema,
    modelRevision: identifierSchema,
    nonce: nonceSchema,
    channelKeyDigest: digestSchema,
    workloadId: identifierSchema,
    route: routeSchema,
    trustPolicyGeneration: positiveSafeIntegerSchema,
    sequence: positiveSafeIntegerSchema,
    signerKeyId: identifierSchema,
    algorithm: z.literal('Ed25519'),
    signature: ed25519SignatureSchema,
  })
  .strict();
export type InferenceReceiptV1 = z.infer<typeof inferenceReceiptV1Schema>;

export function inferenceReceiptV1Payload(input: InferenceReceiptV1): string {
  return [
    'folklore.inference-receipt.v1',
    input.version,
    input.requestSha256,
    input.responseSha256,
    input.model,
    input.modelRevision,
    input.nonce,
    input.channelKeyDigest,
    input.workloadId,
    input.route,
    input.trustPolicyGeneration,
    input.sequence,
    input.signerKeyId,
    input.algorithm,
  ].join('\u0000');
}

// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_SIGNATURE_LENGTH = 8_192;
const identifierSchema = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const positiveSafeIntegerSchema = z.number().int().safe().positive();
const timestampSchema = z
  .string()
  .datetime({ offset: true })
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
const nonceSchema = z
  .string()
  .length(44)
  .regex(/^[A-Za-z0-9+/]{43}=$/);
const ed25519SignatureSchema = z
  .string()
  .length(88)
  .regex(/^[A-Za-z0-9+/]{86}==$/);
const kmsSignatureSchema = z
  .string()
  .min(1)
  .max(MAX_SIGNATURE_LENGTH)
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:(?:[A-Za-z0-9+/][AQgw])==|(?:[A-Za-z0-9+/]{2}[AEIMQUYcgkosw048])=)?$/,
  );

export const assignmentHeadV1Schema = z
  .object({
    version: z.literal(1),
    poolId: identifierSchema,
    headGeneration: positiveSafeIntegerSchema,
    minimumAssignmentGeneration: positiveSafeIntegerSchema,
    manifestDigest: digestSchema,
    releaseDigest: digestSchema,
    inferencePolicyDigest: digestSchema,
    migrationEpoch: positiveSafeIntegerSchema,
    controlCommandHeadDigest: digestSchema,
    predecessorDigest: digestSchema,
    recordedAt: timestampSchema,
  })
  .strict()
  .superRefine((head, context) => {
    if (head.minimumAssignmentGeneration > head.headGeneration) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'minimum assignment generation must not exceed the head generation',
        path: ['minimumAssignmentGeneration'],
      });
    }
  });
export type AssignmentHeadV1 = z.infer<typeof assignmentHeadV1Schema>;

export function assignmentHeadV1Payload(input: AssignmentHeadV1): string {
  return assignmentHeadV1Fields(input, 'folklore.assignment-head.v1').join('\u0000');
}

function assignmentHeadV1Fields(
  input: AssignmentHeadV1,
  domain: string,
): ReadonlyArray<string | number> {
  return [
    domain,
    input.version,
    input.poolId,
    input.headGeneration,
    input.minimumAssignmentGeneration,
    input.manifestDigest,
    input.releaseDigest,
    input.inferencePolicyDigest,
    input.migrationEpoch,
    input.controlCommandHeadDigest,
    input.predecessorDigest,
    input.recordedAt,
  ];
}

const approvalEvidenceSchema = z
  .object({
    recordId: identifierSchema,
    recordDigest: digestSchema,
    signerKeyId: identifierSchema,
    algorithm: z.literal('Ed25519'),
    signature: ed25519SignatureSchema,
  })
  .strict();

const issuerEvidenceSchema = z
  .object({
    keyId: identifierSchema,
    algorithm: z.literal('RSASSA_PSS_SHA_256'),
    signature: kmsSignatureSchema,
  })
  .strict();

export const headAppendAuthorizationSchema = z
  .object({
    version: z.literal(1),
    head: assignmentHeadV1Schema,
    approval: approvalEvidenceSchema,
    issuer: issuerEvidenceSchema,
  })
  .strict();
export type HeadAppendAuthorization = z.infer<typeof headAppendAuthorizationSchema>;

export function headAppendAuthorizationPayload(input: HeadAppendAuthorization): string {
  return [
    ...assignmentHeadV1Fields(input.head, 'folklore.head-append-authorization.v1'),
    input.approval.recordId,
    input.approval.recordDigest,
    input.approval.signerKeyId,
    input.approval.algorithm,
    input.approval.signature,
    input.issuer.keyId,
    input.issuer.algorithm,
  ].join('\u0000');
}

export const signedAssignmentHeadResponseSchema = z
  .object({
    version: z.literal(1),
    head: assignmentHeadV1Schema,
    headDigest: digestSchema,
    nonce: nonceSchema,
    issuedAt: timestampSchema,
    expiresAt: timestampSchema,
    custodianKeyId: identifierSchema,
    algorithm: z.literal('RSASSA_PSS_SHA_256'),
    signature: kmsSignatureSchema,
  })
  .strict()
  .superRefine((response, context) => {
    if (Date.parse(response.expiresAt) <= Date.parse(response.issuedAt)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'expiresAt must be after issuedAt',
        path: ['expiresAt'],
      });
    }
  });
export type SignedAssignmentHeadResponse = z.infer<typeof signedAssignmentHeadResponseSchema>;

export function signedAssignmentHeadResponsePayload(input: SignedAssignmentHeadResponse): string {
  return [
    ...assignmentHeadV1Fields(input.head, 'folklore.signed-assignment-head-response.v1'),
    input.headDigest,
    input.nonce,
    input.issuedAt,
    input.expiresAt,
    input.custodianKeyId,
    input.algorithm,
  ].join('\u0000');
}

// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// The `current-authority/<poolDeploymentId>` item in the pool provisioning authority ledger.
//
// Historically this pointer carried only `operationId`, `generation`, and `requestDigest`, was
// seeded once by Pulumi, and was advanced by the admission writer. The dispatch binding the
// control plane and request writer needed to actually dispatch that generation lived in process
// env, so every new generation required a platform deploy to re-render env.
//
// `CurrentAuthorityPointerV2` carries the full dispatch binding plus the exact request secret
// ARN. Consumers read the binding from this item instead of env. The mint path advances the
// pointer with a monotonic conditional write; the admission writer's existing transactional
// advance is unchanged and remains compatible (it writes a superset-compatible V1 shape, which
// readers treat as "binding unavailable" until a V2 mint lands).
//
// Every field is content-free.

export const OPERATION_ID_V8_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SECRET_ARN_PATTERN = /^arn:aws:secretsmanager:[a-z0-9-]+:\d{12}:secret:[A-Za-z0-9/_+=.@-]+$/;
const RFC3339_MS_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export const currentAuthorityPointerV2Schema = z
  .object({
    schemaVersion: z.literal(2),
    poolDeploymentId: z.string().uuid(),
    operationId: z.string().regex(OPERATION_ID_V8_PATTERN),
    generation: z.number().int().positive(),
    predecessorDigest: z.string().regex(DIGEST_PATTERN).nullable(),
    requestDigest: z.string().regex(DIGEST_PATTERN),
    operationSubjectDigest: z.string().regex(DIGEST_PATTERN),
    expiresAt: z
      .string()
      .regex(RFC3339_MS_PATTERN)
      .refine((value) => new Date(value).toISOString() === value, 'expiresAt must be canonical'),
    requestSecretArn: z.string().regex(SECRET_ARN_PATTERN),
    mintedAt: z
      .string()
      .regex(RFC3339_MS_PATTERN)
      .refine((value) => new Date(value).toISOString() === value, 'mintedAt must be canonical'),
    // Content-free actor label (workflow run id, operator alias). Never a credential.
    mintedBy: z.string().min(1).max(128),
  })
  .strict();
export type CurrentAuthorityPointerV2 = z.infer<typeof currentAuthorityPointerV2Schema>;

/** The dispatch subset of the pointer; a full V2 pointer is accepted and stripped. */
export const commissioningDispatchBindingV1Schema = currentAuthorityPointerV2Schema
  .pick({
    operationId: true,
    requestDigest: true,
    operationSubjectDigest: true,
    poolDeploymentId: true,
    generation: true,
    predecessorDigest: true,
    expiresAt: true,
  })
  .strip();
export type CommissioningDispatchBindingV1 = z.infer<typeof commissioningDispatchBindingV1Schema>;

export function currentAuthorityPointerKey(poolDeploymentId: string): string {
  return `current-authority/${poolDeploymentId}`;
}

type AttributeValue =
  | { S: string }
  | { N: string }
  | { NULL: true }
  | { BOOL: boolean }
  | { M: Record<string, AttributeValue> }
  | { L: AttributeValue[] };

function attrString(item: Record<string, AttributeValue>, name: string): string | undefined {
  const value = item[name];
  return value && 'S' in value ? value.S : undefined;
}

/** Decode a pointer item; V1 yields undefined for env fallback, malformed V2 throws. */
export function decodeCurrentAuthorityPointer(
  item: Record<string, AttributeValue> | undefined,
): CurrentAuthorityPointerV2 | undefined {
  if (!item) return undefined;
  const version = item['schemaVersion'];
  if (!version) return undefined;
  if (!('N' in version) || version.N !== '2') {
    throw new Error('current_authority_pointer_version_unsupported');
  }
  const generation = item['generation'];
  const predecessor = item['predecessorDigest'];
  const candidate = {
    schemaVersion: 2,
    poolDeploymentId: attrString(item, 'poolDeploymentId'),
    operationId: attrString(item, 'operationId'),
    generation: generation && 'N' in generation ? Number(generation.N) : undefined,
    predecessorDigest:
      predecessor && 'NULL' in predecessor
        ? null
        : predecessor && 'S' in predecessor
          ? predecessor.S
          : undefined,
    requestDigest: attrString(item, 'requestDigest'),
    operationSubjectDigest: attrString(item, 'operationSubjectDigest'),
    expiresAt: attrString(item, 'expiresAt'),
    requestSecretArn: attrString(item, 'requestSecretArn'),
    mintedAt: attrString(item, 'mintedAt'),
    mintedBy: attrString(item, 'mintedBy'),
  };
  const parsed = currentAuthorityPointerV2Schema.safeParse(candidate);
  if (!parsed.success) throw new Error('current_authority_pointer_invalid');
  return parsed.data;
}

export function encodeCurrentAuthorityPointer(
  pointer: CurrentAuthorityPointerV2,
): Record<string, AttributeValue> {
  const validated = currentAuthorityPointerV2Schema.parse(pointer);
  return {
    pk: { S: currentAuthorityPointerKey(validated.poolDeploymentId) },
    schemaVersion: { N: '2' },
    poolDeploymentId: { S: validated.poolDeploymentId },
    operationId: { S: validated.operationId },
    generation: { N: String(validated.generation) },
    predecessorDigest:
      validated.predecessorDigest === null ? { NULL: true } : { S: validated.predecessorDigest },
    requestDigest: { S: validated.requestDigest },
    operationSubjectDigest: { S: validated.operationSubjectDigest },
    expiresAt: { S: validated.expiresAt },
    requestSecretArn: { S: validated.requestSecretArn },
    mintedAt: { S: validated.mintedAt },
    mintedBy: { S: validated.mintedBy },
  };
}

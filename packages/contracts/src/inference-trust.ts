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

const spkiPinSchema = digestSchema;

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

export type InferenceSigningKeyV1 = z.infer<typeof receiptKeySchema>;

export const inferenceModelRoleSchema = z.enum(['embed', 'generate', 'judge', 'critique']);
export type InferenceModelRole = z.infer<typeof inferenceModelRoleSchema>;

const roleModelSchema = z
  .object({
    model: providerModelSchema,
    revision: identifierSchema,
  })
  .strict();

export type InferenceRoleModelV1 = z.infer<typeof roleModelSchema>;

const roleModelsSchema = z
  .object({
    embed: roleModelSchema,
    generate: roleModelSchema,
    judge: roleModelSchema,
    critique: roleModelSchema,
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
    tlsSpkiSha256: z.array(spkiPinSchema).min(1).max(2),
    workloadId: identifierSchema,
    quoteRootDigests: z.array(digestSchema).min(1).max(MAX_POLICY_ITEMS),
    workloadMeasurements: z.array(measurementSchema).min(1).max(MAX_POLICY_ITEMS),
    attestationKeys: z.array(receiptKeySchema).min(1).max(MAX_POLICY_ITEMS),
    receiptKeys: z.array(receiptKeySchema).min(1).max(MAX_POLICY_ITEMS),
    permittedModels: z.array(permittedModelSchema).min(1).max(MAX_POLICY_ITEMS),
    roleModels: roleModelsSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    if (!sortedUnique(policy.redirectOrigins)) {
      addSortedIssue(context, ['redirectOrigins'], 'redirect origins must be sorted and unique');
    }
    if (!sortedUnique(policy.tlsSpkiSha256)) {
      addSortedIssue(context, ['tlsSpkiSha256'], 'TLS SPKI pins must be sorted and unique');
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
    if (!sortedUnique(policy.attestationKeys.map((key) => key.keyId))) {
      addSortedIssue(context, ['attestationKeys'], 'attestation keys must be sorted and unique');
    }
    if (!sortedUnique(policy.receiptKeys.map((key) => key.keyId))) {
      addSortedIssue(context, ['receiptKeys'], 'receipt keys must be sorted and unique');
    }
    if (
      !sortedUnique(policy.permittedModels.map((model) => `${model.model}\u0000${model.revision}`))
    ) {
      addSortedIssue(context, ['permittedModels'], 'permitted models must be sorted and unique');
    }
    for (const role of inferenceModelRoleSchema.options) {
      const binding = policy.roleModels[role];
      if (
        !policy.permittedModels.some(
          (model) => model.model === binding.model && model.revision === binding.revision,
        )
      ) {
        addSortedIssue(
          context,
          ['roleModels', role],
          'role model must also be present in permittedModels',
        );
      }
    }
  });
export type InferenceTrustPolicyV1 = z.infer<typeof inferenceTrustPolicyV1Schema>;

export interface InferenceAttestationV1PayloadInput {
  workloadId: string;
  workloadKeysetDigest: string;
  channelKeyDigest: string;
  quoteRootDigest: string;
  workloadMeasurement: string;
  receiptKeysetDigest: string;
  trustPolicyGeneration: number;
  route: string;
  signerKeyId: string;
}

export function inferenceAttestationV1Payload(input: InferenceAttestationV1PayloadInput): string {
  return [
    'folklore.inference-attestation.v1',
    input.workloadId,
    input.workloadKeysetDigest,
    input.channelKeyDigest,
    input.quoteRootDigest,
    input.workloadMeasurement,
    input.receiptKeysetDigest,
    input.trustPolicyGeneration,
    input.route,
    input.signerKeyId,
  ].join('\u0000');
}

export function inferenceReceiptKeysetV1Payload(keys: readonly InferenceSigningKeyV1[]): string {
  const parsed = keys.map((key) => receiptKeySchema.parse(key));
  const sorted = [...parsed].sort((left, right) =>
    left.keyId < right.keyId ? -1 : left.keyId > right.keyId ? 1 : 0,
  );
  return [
    'folklore.inference-receipt-keyset.v1',
    ...sorted.flatMap((key) => [key.keyId, key.algorithm, key.publicKey]),
  ].join('\u0000');
}

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

const MAX_ACI_STRING_LENGTH = 512;
const MAX_ACI_EVENTS = 128;
const MAX_ACI_CHANNEL_BINDINGS = 8;
const MAX_ACI_EVIDENCE_DATA_LENGTH = 1_048_576;
const MAX_ACI_DURATION_SECONDS = 31_536_000;
const MAX_ACI_CLOCK_SKEW_SECONDS = 3_600;
const MAX_ACI_JSON_DEPTH = 64;
const MAX_ACI_JSON_NODES = 4_096;

const aciPrefixedDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const aciHexSchema = z.string().regex(/^[0-9a-f]+$/);
const aciReportDataSchema = z.string().regex(/^[0-9a-f]{64}$/);

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

const aciStringSchema = z
  .string()
  .min(1)
  .max(MAX_ACI_STRING_LENGTH)
  .refine((value) => !hasControlCharacters(value));
const aciNullableStringSchema = aciStringSchema.nullable();
const aciPositiveIntegerSchema = z.number().int().safe().positive();
const aciNonNegativeIntegerSchema = z.number().int().safe().nonnegative();
const aciSignatureAlgorithmSchema = z.enum(['ed25519', 'ecdsa-secp256k1']);
const aciClaimNameSchema = z.enum([
  'tee_attested',
  'gpu_attested',
  'tcb_up_to_date',
  'os_known_good',
  'serving_software_known_good',
  'model_weights_provenance',
]);
const aciClaimSourceSchema = z.enum([
  'hardware_proven',
  'verifier_derived',
  'provider_asserted',
  'operator_asserted',
]);

function isExactHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.hash === '' &&
      parsed.search === '' &&
      parsed.href === value
    );
  } catch {
    return false;
  }
}

const aciHttpsUrlSchema = aciStringSchema.refine(isExactHttpsUrl);
const aciOriginSchema = aciStringSchema.refine(isExactHttpsOrigin);
const aciCommitSchema = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const aciRouteSchema = routeSchema;
const aciModelSchema = z
  .string()
  .min(1)
  .max(MAX_MODEL_ID_LENGTH)
  .refine((value) => !hasControlCharacters(value));
const aciSessionIdSchema = z.string().regex(/^as_[0-9a-f]{64}$/);
const aciEvidenceObjectSchema = z.record(z.string(), z.unknown());

const aciPublicKeySchema = z
  .string()
  .min(64)
  .max(130)
  .regex(/^[0-9a-f]+$/)
  .refine((value) => value.length % 2 === 0);

const aciWorkloadIdentitySchema = z
  .object({
    public_key: z
      .object({
        algo: aciSignatureAlgorithmSchema,
        public_key: aciPublicKeySchema,
      })
      .strict()
      .superRefine((key, context) => {
        if (key.algo === 'ed25519' && key.public_key.length !== 64) {
          addSortedIssue(context, ['public_key'], 'Ed25519 public keys must be 32 bytes');
        }
        if (key.algo === 'ecdsa-secp256k1' && ![66, 130].includes(key.public_key.length)) {
          addSortedIssue(
            context,
            ['public_key'],
            'secp256k1 public keys must be compressed or uncompressed',
          );
        }
      }),
    subject: aciNullableStringSchema.optional(),
  })
  .strict();

const aciKeysetEpochSchema = z
  .object({
    version: aciPositiveIntegerSchema,
    not_after: aciPositiveIntegerSchema,
  })
  .strict();

const aciReceiptSigningKeySchema = z
  .object({
    key_id: identifierSchema,
    algo: aciSignatureAlgorithmSchema,
    public_key: aciPublicKeySchema,
  })
  .strict()
  .superRefine((key, context) => {
    if (key.algo === 'ed25519' && key.public_key.length !== 64) {
      addSortedIssue(context, ['public_key'], 'Ed25519 public keys must be 32 bytes');
    }
    if (key.algo === 'ecdsa-secp256k1' && ![66, 130].includes(key.public_key.length)) {
      addSortedIssue(
        context,
        ['public_key'],
        'secp256k1 public keys must be compressed or uncompressed',
      );
    }
  });

const aciE2eeAlgorithmSchema = z
  .string()
  .min(1)
  .max(MAX_IDENTIFIER_LENGTH)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:+-]*$/);

const aciE2eePublicKeySchema = z
  .object({
    key_id: identifierSchema,
    algo: aciE2eeAlgorithmSchema,
    public_key: aciPublicKeySchema,
  })
  .strict()
  .superRefine((key, context) => {
    const length = key.public_key.length;
    if (key.algo === 'x25519-aes-256-gcm-hkdf-sha256' && length !== 64) {
      addSortedIssue(context, ['public_key'], 'X25519 public keys must be 32 bytes');
    }
    if (key.algo === 'secp256k1-aes-256-gcm-hkdf-sha256' && ![128, 130].includes(length)) {
      addSortedIssue(context, ['public_key'], 'secp256k1 E2EE public keys must be 64 or 65 bytes');
    }
  });

const aciHostnameSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/,
  );

const aciTlsPublicKeySchema = z
  .object({
    spki_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    domain: aciHostnameSchema.optional(),
  })
  .strict();

const aciWorkloadKeysetSchema = z
  .object({
    workload_identity: aciWorkloadIdentitySchema,
    keyset_epoch: aciKeysetEpochSchema,
    receipt_signing_keys: z.array(aciReceiptSigningKeySchema).min(1).max(MAX_POLICY_ITEMS),
    e2ee_public_keys: z.array(aciE2eePublicKeySchema).min(1).max(MAX_POLICY_ITEMS),
    tls_public_keys: z.array(aciTlsPublicKeySchema).max(MAX_POLICY_ITEMS).optional(),
  })
  .strict()
  .superRefine((keyset, context) => {
    const receiptIds = keyset.receipt_signing_keys.map((key) => key.key_id);
    const e2eeIds = keyset.e2ee_public_keys.map((key) => key.key_id);
    const receiptPublicKeys = keyset.receipt_signing_keys.map((key) => key.public_key);
    const e2eePublicKeys = keyset.e2ee_public_keys.map((key) => key.public_key);
    if (new Set(receiptIds).size !== receiptIds.length) {
      addSortedIssue(context, ['receipt_signing_keys'], 'receipt key ids must be unique');
    }
    if (new Set(e2eeIds).size !== e2eeIds.length) {
      addSortedIssue(context, ['e2ee_public_keys'], 'E2EE key ids must be unique');
    }
    if (receiptPublicKeys.some((key) => e2eePublicKeys.includes(key))) {
      addSortedIssue(context, ['e2ee_public_keys'], 'operational keys must be distinct by role');
    }
    if (
      !keyset.e2ee_public_keys.some((key) =>
        ['x25519-aes-256-gcm-hkdf-sha256', 'secp256k1-aes-256-gcm-hkdf-sha256'].includes(key.algo),
      )
    ) {
      addSortedIssue(context, ['e2ee_public_keys'], 'at least one ACI E2EE key is required');
    }
  });

const aciKeysetEndorsementSchema = z
  .object({
    algo: aciSignatureAlgorithmSchema,
    value: aciHexSchema,
  })
  .strict()
  .superRefine((endorsement, context) => {
    const expectedLength = 128;
    if (endorsement.value.length !== expectedLength) {
      addSortedIssue(context, ['value'], 'keyset endorsement has the wrong signature length');
    }
  });

const aciSourceProvenanceSchema = z
  .object({
    repo_url: aciHttpsUrlSchema.nullable(),
    repo_commit: aciCommitSchema.nullable(),
    image_digest: aciPrefixedDigestSchema.nullable(),
    image_provenance: aciEvidenceObjectSchema.nullable(),
  })
  .strict()
  .superRefine((provenance, context) => {
    const hasRepository = provenance.repo_url !== null || provenance.repo_commit !== null;
    if (hasRepository && (provenance.repo_url === null || provenance.repo_commit === null)) {
      addSortedIssue(context, [], 'repository provenance requires both repo_url and repo_commit');
    }
    if (
      provenance.repo_url === null &&
      provenance.repo_commit === null &&
      provenance.image_digest === null
    ) {
      addSortedIssue(context, [], 'source provenance requires a repository commit or image digest');
    }
    if (provenance.image_provenance !== null && provenance.image_digest === null) {
      addSortedIssue(context, ['image_provenance'], 'image provenance requires image_digest');
    }
  });

const aciFreshnessSchema = z
  .object({
    fetched_at: aciPositiveIntegerSchema,
    stale_after: aciPositiveIntegerSchema,
  })
  .strict()
  .superRefine((freshness, context) => {
    if (freshness.stale_after <= freshness.fetched_at) {
      addSortedIssue(context, ['stale_after'], 'stale_after must be later than fetched_at');
    }
  });

const aciServiceCapabilitiesSchema = z
  .object({
    supported_e2ee_versions: z.array(z.literal('2')).min(1).max(4),
  })
  .passthrough();

const aciAttestationSchema = z
  .object({
    vendor: aciStringSchema,
    tee_type: z.enum(['tdx', 'sev_snp']),
    workload_keyset: aciWorkloadKeysetSchema,
    report_data: aciReportDataSchema,
    keyset_endorsement: aciKeysetEndorsementSchema,
    source_provenance: aciSourceProvenanceSchema,
    freshness: aciFreshnessSchema,
    evidence: aciEvidenceObjectSchema,
  })
  .strict()
  .superRefine((attestation, context) => {
    if (
      attestation.keyset_endorsement.algo !==
      attestation.workload_keyset.workload_identity.public_key.algo
    ) {
      addSortedIssue(
        context,
        ['keyset_endorsement', 'algo'],
        'keyset endorsement algorithm must match the identity key algorithm',
      );
    }
  });

export const aciWorkloadReportSchema = z
  .object({
    api_version: z.literal('aci/1'),
    workload_id: aciPrefixedDigestSchema,
    workload_keyset_digest: aciPrefixedDigestSchema,
    attestation: aciAttestationSchema,
    service_capabilities: aciServiceCapabilitiesSchema,
  })
  .strict();
export type AciWorkloadReport = z.infer<typeof aciWorkloadReportSchema>;

const aciClaimSchema = z.union([
  z.object({ status: z.literal('unknown') }).strict(),
  z
    .object({
      status: z.enum(['asserted', 'refuted']),
      source: aciClaimSourceSchema,
      reason: aciStringSchema,
    })
    .strict(),
]);

const aciSessionClaimsSchema = z
  .object({
    tee_attested: aciClaimSchema,
    gpu_attested: aciClaimSchema,
    tcb_up_to_date: aciClaimSchema,
    os_known_good: aciClaimSchema,
    serving_software_known_good: aciClaimSchema,
    model_weights_provenance: aciClaimSchema,
    extra: aciEvidenceObjectSchema.optional(),
  })
  .strict();

const aciChannelBindingSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('tls_spki_sha256'),
      origin: aciOriginSchema,
      spki_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('tls_certificate_sha256'),
      origin: aciOriginSchema,
      certificate_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
  z
    .object({
      type: z.literal('e2ee_public_key_sha256'),
      provider: aciStringSchema,
      key_id: identifierSchema.optional(),
      algorithm: aciE2eeAlgorithmSchema,
      public_key_sha256: z.string().regex(/^[0-9a-f]{64}$/),
    })
    .strict(),
]);

const aciEvidenceRefSchema = z
  .object({
    digest: aciPrefixedDigestSchema.optional(),
    data: z
      .string()
      .max(MAX_ACI_EVIDENCE_DATA_LENGTH)
      .regex(/^data:[^,]{1,256};base64,[A-Za-z0-9+/=_-]*$/)
      .optional(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.data !== undefined && evidence.digest === undefined) {
      addSortedIssue(context, ['digest'], 'evidence data requires a digest');
    }
  });

type AciBoundedJson =
  | string
  | number
  | boolean
  | null
  | AciBoundedJson[]
  | { [key: string]: AciBoundedJson };
const aciBoundedJsonObjectSchema: z.ZodType<{ [key: string]: AciBoundedJson }> = z.custom<{
  [key: string]: AciBoundedJson;
}>((value) => isAciBoundedJsonObject(value), 'expected bounded JSON object');
const aciIdentitySchema = aciBoundedJsonObjectSchema;

function isAciBoundedJsonObject(value: unknown): value is { [key: string]: AciBoundedJson } {
  return validateAciBoundedJson(value, true);
}

function validateAciBoundedJson(value: unknown, requireObject: boolean): boolean {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  const seen = new WeakSet<object>();
  let nodes = 0;
  if (requireObject && !isPlainRecord(value)) return false;
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    nodes += 1;
    if (nodes > MAX_ACI_JSON_NODES || current.depth > MAX_ACI_JSON_DEPTH) return false;
    const item = current.value;
    if (item === null || typeof item === 'boolean') continue;
    if (typeof item === 'string') {
      if (!aciStringSchema.safeParse(item).success) return false;
      continue;
    }
    if (typeof item === 'number') {
      if (!Number.isSafeInteger(item)) return false;
      continue;
    }
    if (typeof item !== 'object' || seen.has(item)) return false;
    seen.add(item);
    if (Array.isArray(item)) {
      if (Object.getPrototypeOf(item) !== Array.prototype || item.length > MAX_POLICY_ITEMS)
        return false;
      for (let index = item.length - 1; index >= 0; index -= 1) {
        stack.push({ value: item[index], depth: current.depth + 1 });
      }
      continue;
    }
    if (!isPlainRecord(item)) return false;
    const entries = Object.entries(item);
    if (entries.length > MAX_POLICY_ITEMS) return false;
    for (const [key, nested] of entries) {
      if (!aciStringSchema.safeParse(key).success) return false;
      stack.push({ value: nested, depth: current.depth + 1 });
    }
  }
  return true;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export const aciSessionSchema = z
  .object({
    api_version: z.literal('aci/1'),
    session_id: aciSessionIdSchema,
    upstream_name: aciStringSchema,
    endpoint: aciOriginSchema.nullable().optional(),
    verifier_id: aciStringSchema,
    established_at: aciPositiveIntegerSchema,
    expires_at: aciPositiveIntegerSchema,
    identity: aciIdentitySchema.optional(),
    channel_binding: z.array(aciChannelBindingSchema).min(1).max(MAX_ACI_CHANNEL_BINDINGS),
    claims: aciSessionClaimsSchema,
    evidence: aciEvidenceRefSchema,
  })
  .strict()
  .superRefine((session, context) => {
    if (session.expires_at <= session.established_at) {
      addSortedIssue(context, ['expires_at'], 'expires_at must be later than established_at');
    }
  });
export type AciSession = z.infer<typeof aciSessionSchema>;

const aciEventBase = {
  seq: aciNonNegativeIntegerSchema,
};

const aciBodyHashSchema = aciPrefixedDigestSchema;
const aciRequestReceivedEventSchema = z
  .object({ ...aciEventBase, type: z.literal('request.received'), body_hash: aciBodyHashSchema })
  .passthrough();
const aciRequestForwardedEventSchema = z
  .object({ ...aciEventBase, type: z.literal('request.forwarded'), body_hash: aciBodyHashSchema })
  .passthrough();
const aciResponseReceivedEventSchema = z
  .object({
    ...aciEventBase,
    type: z.literal('response.received'),
    cleartext_hash: aciBodyHashSchema,
  })
  .passthrough();
const aciResponseReturnedEventSchema = z
  .object({
    ...aciEventBase,
    type: z.literal('response.returned'),
    cleartext_hash: aciBodyHashSchema,
    wire_hash: aciBodyHashSchema,
  })
  .passthrough();
const aciTransparencyRequestEventSchema = z
  .object({ ...aciEventBase, type: z.literal('transparency.request_modified') })
  .passthrough();
const aciTransparencyResponseEventSchema = z
  .object({ ...aciEventBase, type: z.literal('transparency.response_modified') })
  .passthrough();

const aciUpstreamVerifiedEventSchema = z
  .object({
    ...aciEventBase,
    type: z.literal('upstream.verified'),
    upstream_name: aciStringSchema,
    provider_type: aciNullableStringSchema,
    model_id: aciModelSchema,
    url_origin: aciOriginSchema.nullable(),
    verifier_id: aciStringSchema,
    result: z.enum(['verified', 'failed']),
    required: z.boolean(),
    reason: aciNullableStringSchema,
    channel_bindings: z.array(aciChannelBindingSchema).max(MAX_ACI_CHANNEL_BINDINGS),
    provider_claims: aciEvidenceObjectSchema.nullable(),
    session_id: aciSessionIdSchema.optional(),
    claims: aciSessionClaimsSchema.optional(),
  })
  .passthrough()
  .superRefine((event, context) => {
    const hasSession = event.session_id !== undefined;
    const hasClaims = event.claims !== undefined;
    if (event.result === 'verified') {
      if (hasSession !== hasClaims) {
        addSortedIssue(
          context,
          [],
          'verified upstream session_id and claims must be present together',
        );
      }
      if (event.reason !== null) {
        addSortedIssue(
          context,
          ['reason'],
          'verified upstream events cannot carry a failure reason',
        );
      }
      const channelBindings = event.channel_bindings as z.infer<typeof aciChannelBindingSchema>[];
      if (channelBindings.length === 0) {
        addSortedIssue(
          context,
          ['channel_bindings'],
          'verified upstream events require a channel binding',
        );
      }
    } else {
      if (hasSession || hasClaims) {
        addSortedIssue(context, [], 'failed upstream events cannot carry a session or claims');
      }
      if (event.reason === null) {
        addSortedIssue(context, ['reason'], 'failed upstream events require a failure reason');
      }
    }
  });

const aciKnownEventTypes = new Set([
  'request.received',
  'request.forwarded',
  'response.received',
  'response.returned',
  'upstream.verified',
  'transparency.request_modified',
  'transparency.response_modified',
]);

const aciExtensionEventSchema = z
  .object({
    seq: aciNonNegativeIntegerSchema,
    type: aciStringSchema.refine((type) => !aciKnownEventTypes.has(type)),
  })
  .passthrough();

const aciReceiptEventSchema = z.union([
  aciRequestReceivedEventSchema,
  aciRequestForwardedEventSchema,
  aciResponseReceivedEventSchema,
  aciResponseReturnedEventSchema,
  aciTransparencyRequestEventSchema,
  aciTransparencyResponseEventSchema,
  aciUpstreamVerifiedEventSchema,
  aciExtensionEventSchema,
]);

const aciReceiptSignatureSchema = z.discriminatedUnion('algo', [
  z
    .object({
      algo: z.literal('ed25519'),
      key_id: identifierSchema,
      value: z.string().regex(/^[0-9a-f]{128}$/),
    })
    .strict(),
  z
    .object({
      algo: z.literal('ecdsa-secp256k1'),
      key_id: identifierSchema,
      value: z.string().regex(/^[0-9a-f]{130}$/),
    })
    .strict(),
]);

export const aciReceiptSchema = z
  .object({
    api_version: z.literal('aci/1'),
    receipt_id: aciStringSchema,
    chat_id: aciNullableStringSchema,
    model: aciNullableStringSchema,
    workload_id: aciPrefixedDigestSchema,
    workload_keyset_digest: aciPrefixedDigestSchema,
    endpoint: aciRouteSchema,
    method: z
      .string()
      .regex(/^[A-Z][A-Z0-9-]*$/)
      .max(16),
    served_at: aciPositiveIntegerSchema,
    event_log: z.array(aciReceiptEventSchema).min(3).max(MAX_ACI_EVENTS),
    signature: aciReceiptSignatureSchema,
  })
  .strict()
  .superRefine((receipt, context) => {
    const eventTypes = receipt.event_log.map((event) => event.type);
    for (const [index, event] of receipt.event_log.entries()) {
      const previous = receipt.event_log[index - 1];
      if (
        (index === 0 && event.seq !== 0) ||
        (previous !== undefined && event.seq <= previous.seq)
      ) {
        addSortedIssue(
          context,
          ['event_log', index, 'seq'],
          'event sequence must start at zero and be strictly increasing',
        );
      }
    }
    if (eventTypes[0] !== 'request.received') {
      addSortedIssue(context, ['event_log', 0, 'type'], 'the first event must be request.received');
    }
    for (const required of ['request.received', 'request.forwarded', 'response.returned']) {
      if (eventTypes.filter((type) => type === required).length !== 1) {
        addSortedIssue(
          context,
          ['event_log'],
          `receipt must contain exactly one ${required} event`,
        );
      }
    }
    const requestReceivedIndex = eventTypes.indexOf('request.received');
    const requestForwardedIndex = eventTypes.indexOf('request.forwarded');
    const responseReturnedIndex = eventTypes.indexOf('response.returned');
    const responseReceivedIndex = eventTypes.indexOf('response.received');
    const responseModifiedIndexes = eventTypes
      .map((type, index) => (type === 'transparency.response_modified' ? index : -1))
      .filter((index) => index >= 0);
    if (
      requestReceivedIndex >= 0 &&
      requestForwardedIndex >= 0 &&
      responseReturnedIndex >= 0 &&
      (requestForwardedIndex <= requestReceivedIndex ||
        responseReturnedIndex <= requestForwardedIndex)
    ) {
      addSortedIssue(context, ['event_log'], 'request events must precede response.returned');
    }
    if (responseReturnedIndex >= 0) {
      for (const [index, event] of receipt.event_log.entries()) {
        if (
          (event.type === 'upstream.verified' || event.type === 'response.received') &&
          index >= responseReturnedIndex
        ) {
          addSortedIssue(
            context,
            ['event_log', index],
            'response.returned must be last among response events',
          );
        }
      }
    }
    for (const responseModifiedIndex of responseModifiedIndexes) {
      if (
        responseReceivedIndex < 0 ||
        responseModifiedIndex <= responseReceivedIndex ||
        responseModifiedIndex >= responseReturnedIndex
      ) {
        addSortedIssue(
          context,
          ['event_log', responseModifiedIndex],
          'response transparency must follow response.received and precede response.returned',
        );
      }
    }
    for (const [index, event] of receipt.event_log.entries()) {
      if (
        event.type === 'upstream.verified' &&
        (index <= requestForwardedIndex || index >= responseReturnedIndex)
      ) {
        addSortedIssue(
          context,
          ['event_log', index],
          'upstream verification must follow request.forwarded and precede response.returned',
        );
      }
    }
    const received = receipt.event_log.find(
      (event): event is z.infer<typeof aciRequestReceivedEventSchema> =>
        event.type === 'request.received',
    );
    const forwarded = receipt.event_log.find(
      (event): event is z.infer<typeof aciRequestForwardedEventSchema> =>
        event.type === 'request.forwarded',
    );
    if (
      received &&
      forwarded &&
      received.body_hash !== forwarded.body_hash &&
      !eventTypes.includes('transparency.request_modified')
    ) {
      addSortedIssue(
        context,
        ['event_log'],
        'modified requests require transparency.request_modified',
      );
    }
    const receivedResponse = receipt.event_log.find(
      (event): event is z.infer<typeof aciResponseReceivedEventSchema> =>
        event.type === 'response.received',
    );
    const returned = receipt.event_log.find(
      (event): event is z.infer<typeof aciResponseReturnedEventSchema> =>
        event.type === 'response.returned',
    );
    if (
      receivedResponse &&
      returned &&
      receivedResponse.cleartext_hash !== returned.cleartext_hash &&
      !eventTypes.includes('transparency.response_modified')
    ) {
      addSortedIssue(
        context,
        ['event_log'],
        'modified responses require transparency.response_modified',
      );
    }
  });
export type AciReceipt = z.infer<typeof aciReceiptSchema>;

const aciPolicyDigestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const aciPolicyDurationSchema = z.number().int().safe().positive().max(MAX_ACI_DURATION_SECONDS);
const aciPolicyClockSkewSchema = z
  .number()
  .int()
  .safe()
  .nonnegative()
  .max(MAX_ACI_CLOCK_SKEW_SECONDS);
const aciTcbStatusSchema = identifierSchema;
const aciDstackIdentitySchema = aciStringSchema;

const aciPolicyChannelBindingSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.enum(['tls_spki_sha256', 'tls_certificate_sha256']),
      domains: z.array(aciHostnameSchema).min(1).max(MAX_POLICY_ITEMS),
    })
    .strict(),
  z
    .object({
      type: z.literal('e2ee_public_key_sha256'),
      domains: z.array(aciHostnameSchema).min(1).max(MAX_POLICY_ITEMS),
      algorithms: z
        .array(z.enum(['x25519-aes-256-gcm-hkdf-sha256', 'secp256k1-aes-256-gcm-hkdf-sha256']))
        .min(1)
        .max(MAX_POLICY_ITEMS),
    })
    .strict(),
]);

const aciPolicyEvidenceSchema = z
  .object({
    teeTypes: z
      .array(z.enum(['tdx', 'sev_snp']))
      .min(1)
      .max(MAX_POLICY_ITEMS),
    quoteRootDigests: z.array(aciPolicyDigestSchema).min(1).max(MAX_POLICY_ITEMS),
    tcbStatuses: z.array(aciTcbStatusSchema).min(1).max(MAX_POLICY_ITEMS),
    runtimeMeasurements: z.array(measurementSchema).min(1).max(MAX_POLICY_ITEMS),
    runtimeRtmrs: z.array(measurementSchema).min(1).max(MAX_POLICY_ITEMS),
    runtimeIdentities: z.array(aciDstackIdentitySchema).min(1).max(MAX_POLICY_ITEMS),
    dstackAppIdentities: z.array(aciDstackIdentitySchema).min(1).max(MAX_POLICY_ITEMS),
    measuredComposeDigests: z.array(aciPrefixedDigestSchema).max(MAX_POLICY_ITEMS),
    imageDigests: z.array(aciPrefixedDigestSchema).max(MAX_POLICY_ITEMS),
    dstackKmsRoots: z.array(aciPolicyDigestSchema).min(1).max(MAX_POLICY_ITEMS),
  })
  .strict();

const aciPolicyRepositorySchema = z
  .object({
    repoUrl: aciHttpsUrlSchema,
    commits: z.array(aciCommitSchema).min(1).max(MAX_POLICY_ITEMS),
  })
  .strict();

const aciPolicyProvenanceSchema = z
  .object({
    repositories: z.array(aciPolicyRepositorySchema).max(MAX_POLICY_ITEMS),
    imageDigests: z.array(aciPrefixedDigestSchema).max(MAX_POLICY_ITEMS),
  })
  .strict();

const aciPolicyRoleModelsSchema = roleModelsSchema;

export const inferenceTrustPolicyV2Schema = z
  .object({
    version: z.literal(2),
    generation: positiveSafeIntegerSchema,
    origin: exactHttpsOriginSchema,
    route: aciRouteSchema,
    channelPolicy: z
      .object({
        acceptedBindings: z.array(aciPolicyChannelBindingSchema).min(1).max(MAX_POLICY_ITEMS),
      })
      .strict(),
    evidence: aciPolicyEvidenceSchema,
    sourceProvenance: aciPolicyProvenanceSchema,
    requiredSessionClaims: z.array(aciClaimNameSchema).min(1).max(MAX_POLICY_ITEMS),
    permittedClaimSources: z.array(aciClaimSourceSchema).min(1).max(MAX_POLICY_ITEMS),
    permittedModels: z.array(permittedModelSchema).min(1).max(MAX_POLICY_ITEMS),
    roleModels: aciPolicyRoleModelsSchema,
    maxKeysetLifetimeSeconds: aciPolicyDurationSchema,
    maxSessionLifetimeSeconds: aciPolicyDurationSchema,
    clockSkewSeconds: aciPolicyClockSkewSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    if (!sortedUnique(policy.requiredSessionClaims)) {
      addSortedIssue(
        context,
        ['requiredSessionClaims'],
        'required session claims must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.permittedClaimSources)) {
      addSortedIssue(
        context,
        ['permittedClaimSources'],
        'permitted claim sources must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.teeTypes)) {
      addSortedIssue(context, ['evidence', 'teeTypes'], 'TEE types must be sorted and unique');
    }
    if (!sortedUnique(policy.evidence.quoteRootDigests)) {
      addSortedIssue(
        context,
        ['evidence', 'quoteRootDigests'],
        'quote roots must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.tcbStatuses)) {
      addSortedIssue(
        context,
        ['evidence', 'tcbStatuses'],
        'TCB statuses must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.runtimeMeasurements)) {
      addSortedIssue(
        context,
        ['evidence', 'runtimeMeasurements'],
        'runtime measurements must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.runtimeRtmrs)) {
      addSortedIssue(context, ['evidence', 'runtimeRtmrs'], 'RTMRs must be sorted and unique');
    }
    if (!sortedUnique(policy.evidence.runtimeIdentities)) {
      addSortedIssue(
        context,
        ['evidence', 'runtimeIdentities'],
        'runtime identities must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.dstackAppIdentities)) {
      addSortedIssue(
        context,
        ['evidence', 'dstackAppIdentities'],
        'dstack app identities must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.measuredComposeDigests)) {
      addSortedIssue(
        context,
        ['evidence', 'measuredComposeDigests'],
        'Compose digests must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.imageDigests)) {
      addSortedIssue(
        context,
        ['evidence', 'imageDigests'],
        'image digests must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.evidence.dstackKmsRoots)) {
      addSortedIssue(
        context,
        ['evidence', 'dstackKmsRoots'],
        'dstack KMS roots must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.sourceProvenance.repositories.map((repo) => repo.repoUrl))) {
      addSortedIssue(
        context,
        ['sourceProvenance', 'repositories'],
        'repositories must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.sourceProvenance.imageDigests)) {
      addSortedIssue(
        context,
        ['sourceProvenance', 'imageDigests'],
        'source image digests must be sorted and unique',
      );
    }
    for (const [index, repository] of policy.sourceProvenance.repositories.entries()) {
      if (!sortedUnique(repository.commits)) {
        addSortedIssue(
          context,
          ['sourceProvenance', 'repositories', index, 'commits'],
          'repository commits must be sorted and unique',
        );
      }
    }
    if (
      policy.sourceProvenance.repositories.length === 0 &&
      policy.sourceProvenance.imageDigests.length === 0
    ) {
      addSortedIssue(
        context,
        ['sourceProvenance'],
        'source provenance requires a repository or image digest',
      );
    }
    if (
      !sortedUnique(policy.permittedModels.map((model) => `${model.model}\u0000${model.revision}`))
    ) {
      addSortedIssue(context, ['permittedModels'], 'permitted models must be sorted and unique');
    }
    for (const role of inferenceModelRoleSchema.options) {
      const binding = policy.roleModels[role];
      if (
        !policy.permittedModels.some(
          (model) => model.model === binding.model && model.revision === binding.revision,
        )
      ) {
        addSortedIssue(
          context,
          ['roleModels', role],
          'role model must also be present in permittedModels',
        );
      }
    }
    for (const [index, binding] of policy.channelPolicy.acceptedBindings.entries()) {
      if (!sortedUnique(binding.domains)) {
        addSortedIssue(
          context,
          ['channelPolicy', 'acceptedBindings', index, 'domains'],
          'channel domains must be sorted and unique',
        );
      }
      if ('algorithms' in binding && !sortedUnique(binding.algorithms)) {
        addSortedIssue(
          context,
          ['channelPolicy', 'acceptedBindings', index, 'algorithms'],
          'channel algorithms must be sorted and unique',
        );
      }
    }
    if (
      !sortedUnique(policy.channelPolicy.acceptedBindings.map((binding) => JSON.stringify(binding)))
    ) {
      addSortedIssue(
        context,
        ['channelPolicy', 'acceptedBindings'],
        'channel bindings must be sorted and unique',
      );
    }
  });
export type InferenceTrustPolicyV2 = z.infer<typeof inferenceTrustPolicyV2Schema>;

export const ACTIVE_INFERENCE_TRUST_POLICY_V2_CANONICAL_DOMAIN =
  'folklore.inference-trust-policy-v2-active' as const;

export interface ActiveInferenceRoleBindingV2 {
  orgId: string;
  deploymentId: string;
  tenantContextDigest: string;
  role: InferenceModelRole;
  sessionId: string;
  model: string;
  modelRevision: string;
  modelArtifactDigest: string;
  upstreamIdentityDigest: string;
  workloadKeysetDigest: string;
  channelKeyDigest: string;
  channelPins: readonly string[];
  routeIdentityDigest: string;
  requiredSessionClaims: readonly string[];
  permittedClaimSources: readonly string[];
  capabilities: {
    embeddingDimension: number | null;
    maxOutputTokens: number | null;
    temperature: number;
    structuredOutput: boolean;
  };
  establishedAt: number;
  expiresAt: number;
}

export interface ActiveInferenceTrustPolicyV2 {
  schema: 'active-inference-trust-policy-v2';
  version: 2;
  orgId: string;
  deploymentId: string;
  policyGeneration: number;
  activationGeneration: number;
  configurationGeneration: number;
  policyAuthorityKeyId: string;
  authorizationEnvelopeDigest: string;
  policyDigest: string;
  route: {
    origin: string;
    path: string;
    method: 'POST';
    redirectOrigins: readonly string[];
  };
  channel: {
    tlsSpkiSha256: readonly string[];
    e2eeKeyId: string;
    channelKeyDigest: string;
    exporterLabel: string;
  };
  verifier: {
    dstackSourceCommit: string;
    dstackArchiveSha256: string;
    verifierSourceCommit: string;
    verifierArchiveSha256: string;
    quoteRootDigests: readonly string[];
    acceptedTcbStatuses: readonly string[];
    runtimeIdentityDigest: string;
    workloadIdentityDigest: string;
    workloadArtifactDigest: string;
    routeIdentityDigest: string;
  };
  permittedModels: readonly {
    model: string;
    modelRevision: string;
    modelArtifactDigest: string;
  }[];
  roles: Readonly<Record<InferenceModelRole, ActiveInferenceRoleBindingV2>>;
  proof: {
    version: 'pre-forward-route-proof.v1';
    issuerWorkloadId: string;
    pinnedTrustRootDigest: string;
    proofKeysetDigest: string;
    maximumLifetimeMs: number;
  };
  minimumHighWater: {
    policyGeneration: number;
    activationGeneration: number;
    keysetEpoch: number;
    keysetDigest: string;
  };
  lifetime: {
    snapshotExpiresAt: number;
    maximumSessionLifetimeMs: number;
    maximumKeysetLifetimeMs: number;
    admissionLeaseLifetimeMs: number;
    clockSkewMs: number;
  };
  sourceProvenance: {
    protectedSourceCommit: string;
    sourceArchiveSha256: string;
    releaseId: string;
    eifDigest: string;
    pcr0: string;
    releaseProvenanceDigest: string;
  };
  rollbackFloor: {
    minimumPolicyGeneration: number;
    minimumActivationGeneration: number;
    priorPolicyDigest: string | null;
  };
}

const activePolicyModelSchema = z
  .object({
    model: providerModelSchema,
    modelRevision: identifierSchema,
    modelArtifactDigest: digestSchema,
  })
  .strict();

const activeRoleBindingSchema = z
  .object({
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    tenantContextDigest: digestSchema,
    role: inferenceModelRoleSchema,
    sessionId: identifierSchema,
    model: providerModelSchema,
    modelRevision: identifierSchema,
    modelArtifactDigest: digestSchema,
    upstreamIdentityDigest: digestSchema,
    workloadKeysetDigest: digestSchema,
    channelKeyDigest: digestSchema,
    channelPins: z.array(digestSchema).min(1).max(2),
    routeIdentityDigest: digestSchema,
    requiredSessionClaims: z.array(aciClaimNameSchema).min(1).max(MAX_POLICY_ITEMS),
    permittedClaimSources: z.array(aciClaimSourceSchema).min(1).max(MAX_POLICY_ITEMS),
    capabilities: z
      .object({
        embeddingDimension: z.number().int().safe().positive().max(1_000_000).nullable(),
        maxOutputTokens: z.number().int().safe().positive().max(1_000_000).nullable(),
        temperature: z.number().finite().min(0).max(2),
        structuredOutput: z.boolean(),
      })
      .strict(),
    establishedAt: positiveSafeIntegerSchema,
    expiresAt: positiveSafeIntegerSchema,
  })
  .strict()
  .superRefine((binding, context) => {
    if (binding.expiresAt <= binding.establishedAt) {
      addSortedIssue(context, ['expiresAt'], 'role binding must expire after establishment');
    }
    if (!sortedUnique(binding.channelPins)) {
      addSortedIssue(context, ['channelPins'], 'channel pins must be sorted and unique');
    }
    if (!sortedUnique(binding.requiredSessionClaims)) {
      addSortedIssue(
        context,
        ['requiredSessionClaims'],
        'required session claims must be sorted and unique',
      );
    }
    if (!sortedUnique(binding.permittedClaimSources)) {
      addSortedIssue(
        context,
        ['permittedClaimSources'],
        'permitted claim sources must be sorted and unique',
      );
    }
  });

const activeRoleBindingsSchema = z
  .object({
    embed: activeRoleBindingSchema,
    generate: activeRoleBindingSchema,
    judge: activeRoleBindingSchema,
    critique: activeRoleBindingSchema,
  })
  .strict();

export const activeInferenceTrustPolicyV2Schema = z
  .object({
    schema: z.literal('active-inference-trust-policy-v2'),
    version: z.literal(2),
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    policyGeneration: positiveSafeIntegerSchema,
    activationGeneration: positiveSafeIntegerSchema,
    configurationGeneration: positiveSafeIntegerSchema,
    policyAuthorityKeyId: identifierSchema,
    authorizationEnvelopeDigest: digestSchema,
    policyDigest: digestSchema,
    route: z
      .object({
        origin: exactHttpsOriginSchema,
        path: routeSchema,
        method: z.literal('POST'),
        redirectOrigins: z.array(exactHttpsOriginSchema).max(MAX_POLICY_ITEMS),
      })
      .strict(),
    channel: z
      .object({
        tlsSpkiSha256: z.array(digestSchema).min(1).max(2),
        e2eeKeyId: identifierSchema,
        channelKeyDigest: digestSchema,
        exporterLabel: identifierSchema,
      })
      .strict(),
    verifier: z
      .object({
        dstackSourceCommit: aciCommitSchema,
        dstackArchiveSha256: digestSchema,
        verifierSourceCommit: aciCommitSchema,
        verifierArchiveSha256: digestSchema,
        quoteRootDigests: z.array(digestSchema).min(1).max(MAX_POLICY_ITEMS),
        acceptedTcbStatuses: z.array(identifierSchema).min(1).max(MAX_POLICY_ITEMS),
        runtimeIdentityDigest: digestSchema,
        workloadIdentityDigest: digestSchema,
        workloadArtifactDigest: digestSchema,
        routeIdentityDigest: digestSchema,
      })
      .strict(),
    permittedModels: z.array(activePolicyModelSchema).min(1).max(MAX_POLICY_ITEMS),
    roles: activeRoleBindingsSchema,
    proof: z
      .object({
        version: z.literal('pre-forward-route-proof.v1'),
        issuerWorkloadId: identifierSchema,
        pinnedTrustRootDigest: digestSchema,
        proofKeysetDigest: digestSchema,
        maximumLifetimeMs: positiveSafeIntegerSchema,
      })
      .strict(),
    minimumHighWater: z
      .object({
        policyGeneration: positiveSafeIntegerSchema,
        activationGeneration: positiveSafeIntegerSchema,
        keysetEpoch: positiveSafeIntegerSchema,
        keysetDigest: digestSchema,
      })
      .strict(),
    lifetime: z
      .object({
        snapshotExpiresAt: positiveSafeIntegerSchema,
        maximumSessionLifetimeMs: positiveSafeIntegerSchema,
        maximumKeysetLifetimeMs: positiveSafeIntegerSchema,
        admissionLeaseLifetimeMs: positiveSafeIntegerSchema,
        clockSkewMs: z.number().int().safe().nonnegative().max(86_400_000),
      })
      .strict(),
    sourceProvenance: z
      .object({
        protectedSourceCommit: aciCommitSchema,
        sourceArchiveSha256: digestSchema,
        releaseId: identifierSchema,
        eifDigest: digestSchema,
        pcr0: measurementSchema,
        releaseProvenanceDigest: digestSchema,
      })
      .strict(),
    rollbackFloor: z
      .object({
        minimumPolicyGeneration: positiveSafeIntegerSchema,
        minimumActivationGeneration: positiveSafeIntegerSchema,
        priorPolicyDigest: digestSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((policy, context) => {
    if (!sortedUnique(policy.route.redirectOrigins)) {
      addSortedIssue(
        context,
        ['route', 'redirectOrigins'],
        'redirect origins must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.channel.tlsSpkiSha256)) {
      addSortedIssue(context, ['channel', 'tlsSpkiSha256'], 'TLS pins must be sorted and unique');
    }
    if (!sortedUnique(policy.verifier.quoteRootDigests)) {
      addSortedIssue(
        context,
        ['verifier', 'quoteRootDigests'],
        'quote roots must be sorted and unique',
      );
    }
    if (!sortedUnique(policy.verifier.acceptedTcbStatuses)) {
      addSortedIssue(
        context,
        ['verifier', 'acceptedTcbStatuses'],
        'TCB statuses must be sorted and unique',
      );
    }
    if (
      !sortedUnique(
        policy.permittedModels.map(
          (model) => `${model.model}\u0000${model.modelRevision}\u0000${model.modelArtifactDigest}`,
        ),
      )
    ) {
      addSortedIssue(
        context,
        ['permittedModels'],
        'permitted model tuples must be sorted and unique',
      );
    }
    for (const role of inferenceModelRoleSchema.options) {
      const binding = policy.roles[role];
      if (binding.role !== role) {
        addSortedIssue(context, ['roles', role, 'role'], 'role binding key and role must match');
      }
      if (binding.orgId !== policy.orgId || binding.deploymentId !== policy.deploymentId) {
        addSortedIssue(context, ['roles', role], 'role binding must use the policy namespace');
      }
      const matchingModels = policy.permittedModels.filter(
        (model) =>
          model.model === binding.model &&
          model.modelRevision === binding.modelRevision &&
          model.modelArtifactDigest === binding.modelArtifactDigest,
      );
      if (matchingModels.length !== 1) {
        addSortedIssue(
          context,
          ['roles', role],
          'role binding must match one permitted model artifact tuple',
        );
      }
      if (binding.expiresAt > policy.lifetime.snapshotExpiresAt) {
        addSortedIssue(
          context,
          ['roles', role, 'expiresAt'],
          'role binding exceeds snapshot lifetime',
        );
      }
    }
    if (policy.minimumHighWater.policyGeneration > policy.policyGeneration) {
      addSortedIssue(
        context,
        ['minimumHighWater', 'policyGeneration'],
        'policy high-water cannot exceed the active policy generation',
      );
    }
    if (policy.minimumHighWater.activationGeneration > policy.activationGeneration) {
      addSortedIssue(
        context,
        ['minimumHighWater', 'activationGeneration'],
        'activation high-water cannot exceed the active activation generation',
      );
    }
    if (policy.rollbackFloor.minimumPolicyGeneration > policy.policyGeneration) {
      addSortedIssue(
        context,
        ['rollbackFloor', 'minimumPolicyGeneration'],
        'policy rollback floor cannot exceed the active policy generation',
      );
    }
    if (policy.rollbackFloor.minimumActivationGeneration > policy.activationGeneration) {
      addSortedIssue(
        context,
        ['rollbackFloor', 'minimumActivationGeneration'],
        'activation rollback floor cannot exceed the active activation generation',
      );
    }
    if (policy.proof.maximumLifetimeMs > policy.lifetime.maximumSessionLifetimeMs) {
      addSortedIssue(
        context,
        ['proof', 'maximumLifetimeMs'],
        'proof lifetime cannot exceed the maximum session lifetime',
      );
    }
  });

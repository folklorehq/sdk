// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { canonicalJson } from '@folklore/utils';
import type { InferenceModelRole } from '@folklore/contracts';
import {
  mintSha256DigestV1,
  sha256DigestV1Schema,
  type Sha256DigestV1,
} from './official-aci-digests.js';

const OFFICIAL_ACI_REQUEST_DESCRIPTOR_DOMAIN = 'folklore.official-aci-request-descriptor.v1';

export const officialAciRequestDescriptorDigestV1Schema =
  sha256DigestV1Schema.brand<'OfficialAciRequestDescriptorDigestV1'>();
export type OfficialAciRequestDescriptorDigestV1 = z.infer<
  typeof officialAciRequestDescriptorDigestV1Schema
>;

export interface OfficialAciRequestDescriptorFieldsV1 {
  readonly version: 1;
  readonly orgId: string;
  readonly deploymentId: string;
  readonly assignmentDigest: Sha256DigestV1;
  readonly requestId: string;
  readonly activePolicyDigest: Sha256DigestV1;
  readonly policyGeneration: number;
  readonly activationGeneration: number;
  readonly configurationGeneration: number;
  readonly keysetVersion: number;
  readonly bootEpoch: string;
  readonly role: InferenceModelRole;
  readonly modelId: string;
  readonly modelRevision: string;
  readonly modelArtifactDigest: Sha256DigestV1;
  readonly routeIdentityDigest: Sha256DigestV1;
  readonly channelRootDigest: Sha256DigestV1;
  readonly sessionId: string;
  readonly trustedTimeCheckpointDigest: Sha256DigestV1;
}

export type OfficialAciRequestDescriptorPreimageV1 = {
  readonly schema: 'OfficialAciRequestDescriptorPreimageV1';
} & OfficialAciRequestDescriptorFieldsV1;

export type OfficialAciRequestDescriptorV1 = OfficialAciRequestDescriptorFieldsV1 & {
  readonly schema: 'OfficialAciRequestDescriptorV1';
  readonly descriptorDigest: OfficialAciRequestDescriptorDigestV1;
  readonly __officialAciRequestDescriptorV1: true;
};

const DESCRIPTOR_FIELD_KEYS: readonly (keyof OfficialAciRequestDescriptorFieldsV1)[] = [
  'version',
  'orgId',
  'deploymentId',
  'assignmentDigest',
  'requestId',
  'activePolicyDigest',
  'policyGeneration',
  'activationGeneration',
  'configurationGeneration',
  'keysetVersion',
  'bootEpoch',
  'role',
  'modelId',
  'modelRevision',
  'modelArtifactDigest',
  'routeIdentityDigest',
  'channelRootDigest',
  'sessionId',
  'trustedTimeCheckpointDigest',
];

function toFields(
  source: OfficialAciRequestDescriptorFieldsV1,
): OfficialAciRequestDescriptorFieldsV1 {
  return {
    version: source.version,
    orgId: source.orgId,
    deploymentId: source.deploymentId,
    assignmentDigest: source.assignmentDigest,
    requestId: source.requestId,
    activePolicyDigest: source.activePolicyDigest,
    policyGeneration: source.policyGeneration,
    activationGeneration: source.activationGeneration,
    configurationGeneration: source.configurationGeneration,
    keysetVersion: source.keysetVersion,
    bootEpoch: source.bootEpoch,
    role: source.role,
    modelId: source.modelId,
    modelRevision: source.modelRevision,
    modelArtifactDigest: source.modelArtifactDigest,
    routeIdentityDigest: source.routeIdentityDigest,
    channelRootDigest: source.channelRootDigest,
    sessionId: source.sessionId,
    trustedTimeCheckpointDigest: source.trustedTimeCheckpointDigest,
  };
}

function descriptorDigest(
  fields: OfficialAciRequestDescriptorFieldsV1,
): OfficialAciRequestDescriptorDigestV1 {
  const preimage: OfficialAciRequestDescriptorPreimageV1 = {
    schema: 'OfficialAciRequestDescriptorPreimageV1',
    ...fields,
  };
  const bytes = new TextEncoder().encode(
    `${OFFICIAL_ACI_REQUEST_DESCRIPTOR_DOMAIN}\u0000${canonicalJson(preimage)}`,
  );
  return officialAciRequestDescriptorDigestV1Schema.parse(mintSha256DigestV1(bytes));
}

export function createOfficialAciRequestDescriptor(
  fields: OfficialAciRequestDescriptorFieldsV1,
): OfficialAciRequestDescriptorV1 {
  if (fields.version !== 1)
    throw new TypeError('official ACI request descriptor version is unsupported');
  const normalized = toFields(fields);
  return Object.freeze({
    schema: 'OfficialAciRequestDescriptorV1',
    ...normalized,
    descriptorDigest: descriptorDigest(normalized),
    __officialAciRequestDescriptorV1: true,
  });
}

export function assertOfficialAciRequestDescriptor(value: OfficialAciRequestDescriptorV1): void {
  const keys = new Set(Object.keys(value));
  const allowed = new Set<string>([
    'schema',
    'descriptorDigest',
    '__officialAciRequestDescriptorV1',
    ...DESCRIPTOR_FIELD_KEYS,
  ]);
  if (keys.size !== allowed.size) {
    throw new Error('official ACI request descriptor has an unexpected field set');
  }
  for (const key of keys) {
    if (!allowed.has(key)) {
      throw new Error(`official ACI request descriptor has an unexpected field: ${key}`);
    }
  }
  if (value.schema !== 'OfficialAciRequestDescriptorV1') {
    throw new Error('official ACI request descriptor has an unexpected schema');
  }
  if (value.version !== 1) {
    throw new Error('official ACI request descriptor has an unsupported version');
  }
  const recomputed = descriptorDigest(toFields(value));
  if (recomputed !== value.descriptorDigest) {
    throw new Error('official ACI request descriptor digest does not match its fields');
  }
}

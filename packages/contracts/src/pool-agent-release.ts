// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { enclaveArtifactDescriptorSchema } from './rollout.js';

const ECR_REPOSITORY_PATTERN =
  /^\d{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com\/[a-z0-9]+(?:[._/-][a-z0-9]+)*$/;
/** An immutable OCI image digest, as every agent release names its image. */
export const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ED25519_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/;
const SIGNER_KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const PCR0_PATTERN = /^(?!0{96}$)[0-9a-f]{96}$/;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const STACK_PATTERN = /^[a-z][a-z0-9-]*$/;

export const POOL_AGENT_RELEASE_PUBLICATION_SCHEMA = 'PoolAgentReleasePublicationV1' as const;

/** The signed `folklore.update.v3` descriptor a release publishes for its pool host agent image. */
export const poolAgentReleaseDescriptorSchema = z
  .object({
    repository: z.string().regex(ECR_REPOSITORY_PATTERN),
    digest: z.string().regex(IMAGE_DIGEST_PATTERN),
    requestId: z.string().regex(REQUEST_ID_PATTERN),
    signature: z.string().regex(ED25519_SIGNATURE_PATTERN),
    signerKeyId: z.string().regex(SIGNER_KEY_ID_PATTERN),
    targetPcr0: z.string().regex(PCR0_PATTERN),
    targetVersion: z.string().regex(SOURCE_SHA_PATTERN),
    enclaveArtifact: enclaveArtifactDescriptorSchema,
  })
  .strict();

export type PoolAgentReleaseDescriptor = z.infer<typeof poolAgentReleaseDescriptorSchema>;

// A store document, not a trust anchor: every consumer verifies the descriptor's signature itself.
export const poolAgentReleasePublicationSchema = z
  .object({
    schema: z.literal(POOL_AGENT_RELEASE_PUBLICATION_SCHEMA),
    version: z.literal(1),
    sourceSha: z.string(),
    signerKeyId: z.string(),
    spkiSha256: z.string(),
    descriptor: z.string(),
  })
  .strict();

export type PoolAgentReleasePublication = z.infer<typeof poolAgentReleasePublicationSchema>;

/** The SSM parameter a platform stack's release publishes its pool agent release document to. */
export function poolAgentReleasePublicationParameterName(stack: string): string {
  if (!STACK_PATTERN.test(stack)) throw new Error('pool_agent_release_stack_invalid');
  return `/folklore/${stack}/pool-agent-release`;
}

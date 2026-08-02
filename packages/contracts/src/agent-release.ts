// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const SIGNER_KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export const agentReleaseDescriptorSchema = z
  .object({
    repository: z.string().min(1),
    digest: z.string().regex(IMAGE_DIGEST_PATTERN),
    sourceSha: z.string().regex(SOURCE_SHA_PATTERN),
    signature: z.string().min(1).regex(BASE64_PATTERN),
    signerKeyId: z.string().regex(SIGNER_KEY_ID_PATTERN),
  })
  .strict();

export type AgentReleaseDescriptor = z.infer<typeof agentReleaseDescriptorSchema>;

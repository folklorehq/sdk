// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// Enclave-authed per-member identity link drain/ack wire DTO. Content-free:
// a link is only (sourceUserId ↔ member email) org metadata, never customer content.
export const pendingMemberIdentityLinkSchema = z
  .object({
    id: z.string(),
    orgId: z.string(),
    kind: z.string(),
    memberEmail: z.string(),
    sourceUserId: z.string(),
  })
  .strict();

export type PendingMemberIdentityLink = z.infer<typeof pendingMemberIdentityLinkSchema>;

// The signed output a pool enclave sends once it has fetched a confirmed link; the worker applies it.
export const memberIdentityLinkOutputSchema = z
  .object({
    type: z.literal('member_identity_link'),
    orgId: z.string().uuid(),
    linkId: z.string().min(1).max(128),
    kind: z.string().min(1).max(64),
    sourceUserId: z.string().min(1).max(256),
    memberEmail: z.string().email().max(320),
  })
  .strict();

export type MemberIdentityLinkOutput = z.infer<typeof memberIdentityLinkOutputSchema>;

export const memberIdentityLinksResponseSchema = z
  .object({ links: z.array(pendingMemberIdentityLinkSchema) })
  .strict();

export type MemberIdentityLinksResponse = z.infer<typeof memberIdentityLinksResponseSchema>;

export const memberIdentityLinkPersistenceSchema = z
  .object({
    deploymentId: z.string().uuid(),
    orgId: z.string().uuid(),
    attestationGeneration: z.string().uuid(),
    accountId: z.string().uuid(),
    sourceKind: z.string().min(1).max(64),
    memberEmail: z.string().email().max(320),
    sourceUserId: z.string().min(1).max(256),
  })
  .strict();

export type MemberIdentityLinkPersistence = z.infer<typeof memberIdentityLinkPersistenceSchema>;

export const memberIdentityLinkAckRequestSchema = z.object({ ids: z.array(z.string()) }).strict();

export type MemberIdentityLinkAckRequest = z.infer<typeof memberIdentityLinkAckRequestSchema>;

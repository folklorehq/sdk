// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
// Enclave-authed per-member identity link drain/ack wire DTO (ADL #36 §3). Content-free:
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
export const memberIdentityLinksResponseSchema = z
    .object({ links: z.array(pendingMemberIdentityLinkSchema) })
    .strict();
export const memberIdentityLinkAckRequestSchema = z.object({ ids: z.array(z.string()) }).strict();
//# sourceMappingURL=member-identity-links.js.map
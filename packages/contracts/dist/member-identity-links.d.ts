import { z } from 'zod';
export declare const pendingMemberIdentityLinkSchema: z.ZodObject<{
    id: z.ZodString;
    orgId: z.ZodString;
    kind: z.ZodString;
    memberEmail: z.ZodString;
    sourceUserId: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: string;
    orgId: string;
    memberEmail: string;
    sourceUserId: string;
}, {
    id: string;
    kind: string;
    orgId: string;
    memberEmail: string;
    sourceUserId: string;
}>;
export type PendingMemberIdentityLink = z.infer<typeof pendingMemberIdentityLinkSchema>;
export declare const memberIdentityLinksResponseSchema: z.ZodObject<{
    links: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        orgId: z.ZodString;
        kind: z.ZodString;
        memberEmail: z.ZodString;
        sourceUserId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        kind: string;
        orgId: string;
        memberEmail: string;
        sourceUserId: string;
    }, {
        id: string;
        kind: string;
        orgId: string;
        memberEmail: string;
        sourceUserId: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    links: {
        id: string;
        kind: string;
        orgId: string;
        memberEmail: string;
        sourceUserId: string;
    }[];
}, {
    links: {
        id: string;
        kind: string;
        orgId: string;
        memberEmail: string;
        sourceUserId: string;
    }[];
}>;
export type MemberIdentityLinksResponse = z.infer<typeof memberIdentityLinksResponseSchema>;
export declare const memberIdentityLinkAckRequestSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    ids: string[];
}, {
    ids: string[];
}>;
export type MemberIdentityLinkAckRequest = z.infer<typeof memberIdentityLinkAckRequestSchema>;
//# sourceMappingURL=member-identity-links.d.ts.map
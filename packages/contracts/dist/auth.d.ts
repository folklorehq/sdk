import { z } from 'zod';
export declare const magicLinkRequestSchema: z.ZodObject<{
    email: z.ZodString;
}, "strict", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export type MagicLinkRequest = z.infer<typeof magicLinkRequestSchema>;
export declare const magicLinkRequestResultSchema: z.ZodObject<{
    ok: z.ZodLiteral<true>;
}, "strict", z.ZodTypeAny, {
    ok: true;
}, {
    ok: true;
}>;
export type MagicLinkRequestResult = z.infer<typeof magicLinkRequestResultSchema>;
export declare const mfaCodeSchema: z.ZodString;
export declare const mfaCodeBodySchema: z.ZodObject<{
    code: z.ZodString;
}, "strict", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
export type MfaCodeBody = z.infer<typeof mfaCodeBodySchema>;
export declare const mfaStatusSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    pending: z.ZodBoolean;
    recoveryCodesRemaining: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    enabled: boolean;
    pending: boolean;
    recoveryCodesRemaining: number;
}, {
    enabled: boolean;
    pending: boolean;
    recoveryCodesRemaining: number;
}>;
export type MfaStatusDto = z.infer<typeof mfaStatusSchema>;
export declare const mfaEnrollStartSchema: z.ZodObject<{
    secret: z.ZodString;
    otpauthUri: z.ZodString;
}, "strict", z.ZodTypeAny, {
    secret: string;
    otpauthUri: string;
}, {
    secret: string;
    otpauthUri: string;
}>;
export type MfaEnrollStart = z.infer<typeof mfaEnrollStartSchema>;
export declare const mfaConfirmResultSchema: z.ZodObject<{
    recoveryCodes: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    recoveryCodes: string[];
}, {
    recoveryCodes: string[];
}>;
export type MfaConfirmResult = z.infer<typeof mfaConfirmResultSchema>;
//# sourceMappingURL=auth.d.ts.map
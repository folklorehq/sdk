import { z } from 'zod';
export declare const AttestationManifestSchema: z.ZodObject<{
    commit: z.ZodOptional<z.ZodString>;
    built_at: z.ZodOptional<z.ZodString>;
    eif_sha256: z.ZodOptional<z.ZodString>;
    pcr0: z.ZodString;
    pcr1: z.ZodOptional<z.ZodString>;
    pcr2: z.ZodOptional<z.ZodString>;
    note: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    pcr0: string;
    commit?: string | undefined;
    built_at?: string | undefined;
    eif_sha256?: string | undefined;
    pcr1?: string | undefined;
    pcr2?: string | undefined;
    note?: string | undefined;
    version?: string | undefined;
}, {
    pcr0: string;
    commit?: string | undefined;
    built_at?: string | undefined;
    eif_sha256?: string | undefined;
    pcr1?: string | undefined;
    pcr2?: string | undefined;
    note?: string | undefined;
    version?: string | undefined;
}>;
export type AttestationManifest = z.infer<typeof AttestationManifestSchema>;
//# sourceMappingURL=schema.d.ts.map
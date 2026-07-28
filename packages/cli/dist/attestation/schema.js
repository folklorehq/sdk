// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
const pcrHex = z.string().regex(/^[0-9a-f]{96}$/i);
export const AttestationManifestSchema = z.object({
    commit: z.string().min(1).optional(),
    built_at: z.string().optional(),
    eif_sha256: z
        .string()
        .regex(/^[0-9a-f]{64}$/i)
        .optional(),
    pcr0: pcrHex,
    pcr1: pcrHex.optional(),
    pcr2: pcrHex.optional(),
    note: z.string().optional(),
    version: z.string().optional(),
});
//# sourceMappingURL=schema.js.map
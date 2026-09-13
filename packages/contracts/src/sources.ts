// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const sourceCatalogResponseSchema = z.object({ enabledKinds: z.array(z.string()) }).strict();

export type SourceCatalogResponse = z.infer<typeof sourceCatalogResponseSchema>;

export const sourceCapabilitiesResponseSchema = z
  .object({ codebaseAvailable: z.boolean() })
  .strict();

export type SourceCapabilitiesResponse = z.infer<typeof sourceCapabilitiesResponseSchema>;

export const sourceActivationReadinessResponseSchema = z
  .object({ orgId: z.string().uuid(), ready: z.boolean() })
  .strict();

export type SourceActivationReadinessResponse = z.infer<
  typeof sourceActivationReadinessResponseSchema
>;

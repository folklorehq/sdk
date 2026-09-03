// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { factKindSchema } from './enclave.js';

export const factSourceKindSchema = z.enum([
  'github',
  'slack',
  'notion',
  'linear',
  'jira',
  'intercom',
  'meeting',
  'code',
  'confluence',
  'email',
  'google_calendar',
  'google_drive',
  'gmail',
  'microsoft365_calendar',
  'microsoft365_mail',
  'microsoft365',
  'zoom_bot',
  'zoom',
]);

export const factListQuerySchema = z
  .object({
    sourceKind: factSourceKindSchema.optional(),
    kind: factKindSchema.optional(),
    occurredFrom: z.string().datetime().optional(),
    occurredTo: z.string().datetime().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();
export type FactListQuery = z.infer<typeof factListQuerySchema>;

export const factSummarySchema = z
  .object({
    id: z.string(),
    kind: factKindSchema,
    sourceId: z.string(),
    sourceKind: factSourceKindSchema,
    sourceFactId: z.string().nullable(),
    occurredAt: z.string().datetime(),
    ingestedAt: z.string().datetime(),
  })
  .strict();
export type FactSummary = z.infer<typeof factSummarySchema>;

export const factListResponseSchema = z
  .object({
    rows: z.array(factSummarySchema),
    total: z.number().int().nonnegative(),
    hasMore: z.boolean(),
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
  })
  .strict();
export type FactListResponse = z.infer<typeof factListResponseSchema>;

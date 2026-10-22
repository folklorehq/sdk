// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { factKindSchema } from './enclave.js';
import { SNIPPET_MAX_CHARS } from './search.js';

export const FACT_EXCERPT_MAX_CHARS = 1_200;
export const FACT_EXCERPT_BATCH_MAX = 50;
export const FACT_SNIPPETS_ENABLED = '1';

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
    snippets: z.string().optional(),
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
    snippet: z.string().max(SNIPPET_MAX_CHARS).optional(),
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

export const FACT_VOLUME_MAX_DAYS = 31;
const FACT_VOLUME_DEFAULT_DAYS = 14;
const MAX_UTC_OFFSET_MINUTES = 840;

export const factVolumeQuerySchema = z
  .object({
    days: z.coerce
      .number()
      .int()
      .min(1)
      .max(FACT_VOLUME_MAX_DAYS)
      .default(FACT_VOLUME_DEFAULT_DAYS),
    tzOffsetMinutes: z.coerce
      .number()
      .int()
      .min(-MAX_UTC_OFFSET_MINUTES)
      .max(MAX_UTC_OFFSET_MINUTES)
      .default(0),
  })
  .strict();
export type FactVolumeQuery = z.infer<typeof factVolumeQuerySchema>;

export const factSourceCountSchema = z
  .object({ sourceKind: factSourceKindSchema, count: z.number().int().nonnegative() })
  .strict();
export type FactSourceCount = z.infer<typeof factSourceCountSchema>;

// total counts every kind, so total >= sum(sources[].count); the remainder is kinds outside factSourceKindSchema.
export const factVolumeResponseSchema = z
  .object({
    days: z.array(
      z
        .object({
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          total: z.number().int().nonnegative(),
          sources: z.array(factSourceCountSchema),
        })
        .strict(),
    ),
    sources: z.array(factSourceCountSchema),
    total: z.number().int().nonnegative(),
  })
  .strict();
export type FactVolumeResponse = z.infer<typeof factVolumeResponseSchema>;

export const factExcerptResponseSchema = z
  .object({
    factId: z.string().uuid(),
    excerpt: z.string().max(FACT_EXCERPT_MAX_CHARS),
  })
  .strict();
export type FactExcerptResponse = z.infer<typeof factExcerptResponseSchema>;

// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const DATA_CORRECTION_JOBS = [
  'link_referenced_containers',
  'rescore_facts',
  'retier_medium_suggestions',
  'force_theme_resynthesis',
  'retire_placeholder_themes',
  'reset_failed_wiki_outbox',
  'redrive_processed_dlq',
  // Registered by #3048 WS6d (CP8); listed here so that job needs no migration.
  'backfill_fact_authors',
] as const;
export const DATA_CORRECTION_MODES = ['dry_run', 'apply', 'rollback'] as const;
export const DATA_CORRECTION_BATCH_MAX = 500;
const DATA_CORRECTION_BATCH_DEFAULT = 200;

// Lowercased so the run lookup, the advisory lock key and resume all see one spelling of an id.
const canonicalUuid = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());

export const dataCorrectionInvocationSchema = z
  .object({
    orgId: canonicalUuid,
    job: z.enum(DATA_CORRECTION_JOBS),
    mode: z.enum(DATA_CORRECTION_MODES),
    revertsRunId: canonicalUuid.optional(),
    batchLimit: z
      .number()
      .int()
      .min(1)
      .max(DATA_CORRECTION_BATCH_MAX)
      .default(DATA_CORRECTION_BATCH_DEFAULT),
  })
  .strict()
  .refine(
    (v) => (v.mode === 'rollback') === (v.revertsRunId !== undefined),
    'reverts_run_id_mismatch',
  );

// Count keys are snake_case identifiers so a result can never carry a name or label.
const COUNT_KEY = /^[a-z][a-z_]{0,47}$/;
export const dataCorrectionResultSchema = z
  .object({
    runId: z.string().uuid(),
    job: z.enum(DATA_CORRECTION_JOBS),
    mode: z.enum(DATA_CORRECTION_MODES),
    done: z.boolean(),
    counts: z.record(z.string().regex(COUNT_KEY), z.number().int().nonnegative()),
  })
  .strict();
export type DataCorrectionInvocation = z.infer<typeof dataCorrectionInvocationSchema>;
export type DataCorrectionResult = z.infer<typeof dataCorrectionResultSchema>;
export type DataCorrectionJobName = (typeof DATA_CORRECTION_JOBS)[number];
export type DataCorrectionMode = (typeof DATA_CORRECTION_MODES)[number];

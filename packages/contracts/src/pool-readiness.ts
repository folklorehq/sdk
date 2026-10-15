// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const HIGH_WATER_READ_PHASES = [
  'listing',
  'fetching',
  'verifying',
  'verified',
  'refused',
] as const;
export const highWaterReadPhaseSchema = z.enum(HIGH_WATER_READ_PHASES);
export type HighWaterReadPhase = z.infer<typeof highWaterReadPhaseSchema>;

export const TENANT_APPLY_PHASES = ['policy', 'keys', 'index', 'context', 'acked'] as const;
export const tenantApplyPhaseSchema = z.enum(TENANT_APPLY_PHASES);
export type TenantApplyPhase = z.infer<typeof tenantApplyPhaseSchema>;

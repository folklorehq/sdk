// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const RESOURCE_SCOPE_UNITS = ['channel', 'project', 'team', 'repository'] as const;
export const resourceScopeUnitSchema = z.enum(RESOURCE_SCOPE_UNITS);
export type ResourceScopeUnit = z.infer<typeof resourceScopeUnitSchema>;

export const RESOURCE_SCOPE_MAX_SELECTED = 500;

export const RESOURCE_SCOPE_ERROR_CODES = {
  conflict: 'resource_scope_conflict',
  invalid: 'resource_scope_invalid',
  unavailable: 'resource_scope_unavailable',
} as const;
const RESOURCE_ID_MAX_LENGTH = 256;
const SCOPE_PAGE_CURSOR_MAX_LENGTH = 64;
const SCOPE_PAGE_QUERY_MAX_LENGTH = 100;

const revisionSchema = z.number().int().nonnegative();
export const resourceIdSchema = z.string().min(1).max(RESOURCE_ID_MAX_LENGTH);

export const resourceScopeRequestSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('all'), expectedRevision: revisionSchema }).strict(),
  z
    .object({
      mode: z.literal('selected'),
      expectedRevision: revisionSchema,
      resourceIds: z.array(resourceIdSchema).min(1).max(RESOURCE_SCOPE_MAX_SELECTED),
    })
    .strict(),
]);
export type ResourceScopeRequest = z.infer<typeof resourceScopeRequestSchema>;

export const resourceScopePausedRequestSchema = z
  .object({ paused: z.boolean(), expectedRevision: revisionSchema })
  .strict();
export type ResourceScopePausedRequest = z.infer<typeof resourceScopePausedRequestSchema>;

export const resourceScopeResponseSchema = z
  .object({
    revision: revisionSchema,
    mode: z.enum(['all', 'selected']),
    resourceIds: z.array(resourceIdSchema),
    paused: z.boolean(),
  })
  .strict();
export type ResourceScopeResponse = z.infer<typeof resourceScopeResponseSchema>;

export const scopeResourcePageQuerySchema = z
  .object({
    cursor: z.string().max(SCOPE_PAGE_CURSOR_MAX_LENGTH).optional(),
    query: z.string().max(SCOPE_PAGE_QUERY_MAX_LENGTH).optional(),
  })
  .strict();
export type ScopeResourcePageQuery = z.infer<typeof scopeResourcePageQuerySchema>;

export const scopeResourcePageSchema = z
  .object({
    items: z.array(z.object({ id: z.string(), name: z.string(), isPublic: z.boolean() }).strict()),
    nextCursor: z.string().nullable(),
  })
  .strict();
export type ScopeResourcePage = z.infer<typeof scopeResourcePageSchema>;

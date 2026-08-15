// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const repositoryIdSchema = z.number().int().positive();

function isRepositoryCursor(value: string): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;
  try {
    const padded = value
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(value.length / 4) * 4, '=');
    const parsed = JSON.parse(atob(padded)) as unknown;
    return (
      typeof parsed === 'object' &&
      parsed !== null &&
      Object.keys(parsed).length === 1 &&
      Object.hasOwn(parsed, 'offset') &&
      Number.isSafeInteger((parsed as { offset: unknown }).offset) &&
      (parsed as { offset: number }).offset >= 0
    );
  } catch {
    return false;
  }
}

export const codebaseRepositorySchema = z
  .object({
    id: repositoryIdSchema,
    fullName: z.string().min(1).max(512),
  })
  .strict();
export type CodebaseRepository = z.infer<typeof codebaseRepositorySchema>;

export const codebaseRepositoryPageQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).refine(isRepositoryCursor).optional(),
    query: z.string().trim().min(1).max(128).optional(),
  })
  .strict();
export type CodebaseRepositoryPageQuery = z.infer<typeof codebaseRepositoryPageQuerySchema>;

export const codebaseRepositoryPageSchema = z
  .object({
    items: z.array(codebaseRepositorySchema).max(100),
    nextCursor: z.string().min(1).max(512).nullable(),
  })
  .strict();
export type CodebaseRepositoryPage = z.infer<typeof codebaseRepositoryPageSchema>;

export const codebaseSelectionResponseSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('all'),
      revision: z.number().int().nonnegative(),
      repositoryIds: z.tuple([]),
    })
    .strict(),
  z
    .object({
      mode: z.literal('selected'),
      revision: z.number().int().nonnegative(),
      repositoryIds: z.array(repositoryIdSchema).min(1).max(500),
    })
    .strict(),
]);
export type CodebaseSelectionResponse = z.infer<typeof codebaseSelectionResponseSchema>;

export const codebaseSelectionRequestSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('all'),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      mode: z.literal('selected'),
      repositoryIds: z
        .array(repositoryIdSchema)
        .min(1)
        .max(500)
        .refine((ids) => new Set(ids).size === ids.length, {
          message: 'must not contain duplicates',
        }),
      expectedRevision: z.number().int().nonnegative(),
    })
    .strict(),
]);
export type CodebaseSelectionRequest = z.infer<typeof codebaseSelectionRequestSchema>;

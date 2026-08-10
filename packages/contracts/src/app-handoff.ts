// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const opaqueBearerSchema = z
  .string()
  .min(43)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/);

export const appHandoffIssueInputSchema = z
  .object({
    orgId: z.string().uuid(),
    nonce: opaqueBearerSchema,
  })
  .strict();
export type AppHandoffIssueInput = z.infer<typeof appHandoffIssueInputSchema>;

export const appHandoffIssueResponseSchema = z
  .object({
    code: opaqueBearerSchema,
    callbackUrl: z.string().url(),
  })
  .strict();
export type AppHandoffIssueResponse = z.infer<typeof appHandoffIssueResponseSchema>;

export const appHandoffExchangeInputSchema = z
  .object({
    code: opaqueBearerSchema,
    nonce: opaqueBearerSchema,
  })
  .strict();
export type AppHandoffExchangeInput = z.infer<typeof appHandoffExchangeInputSchema>;

export const appHandoffExchangeResponseSchema = z
  .object({
    token: z.string().min(1),
    expiresIn: z.number().int().positive(),
  })
  .strict();
export type AppHandoffExchangeResponse = z.infer<typeof appHandoffExchangeResponseSchema>;

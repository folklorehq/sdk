// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const sessionDeliveryConsumeSchema = z
  .object({
    delivery: z
      .string()
      .min(43)
      .max(128)
      .regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();
export type SessionDeliveryConsume = z.infer<typeof sessionDeliveryConsumeSchema>;

export const sessionDeliveryResponseSchema = z.object({ token: z.string().min(1) }).strict();
export type SessionDeliveryResponse = z.infer<typeof sessionDeliveryResponseSchema>;

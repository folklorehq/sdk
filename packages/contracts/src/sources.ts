// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  FIRSTPARTY_ICON_KEYS,
  FIRSTPARTY_MAX_API_HOSTS,
  FIRSTPARTY_MAX_DISPLAY_NAME_LENGTH,
} from './connectors/firstparty/firstparty-definition.js';
import {
  FIRSTPARTY_MAX_LIVE_CONNECTORS,
  firstpartySourceKeySchema,
} from './connectors/firstparty/firstparty-source-key.js';
import { hostSchema } from './connectors/manifest.js';

export const firstpartyCatalogEntrySchema = z
  .object({
    kind: firstpartySourceKeySchema,
    displayName: z.string().min(1).max(FIRSTPARTY_MAX_DISPLAY_NAME_LENGTH),
    iconKey: z.enum(FIRSTPARTY_ICON_KEYS).nullable(),
    hosts: z
      .object({
        authorize: hostSchema,
        api: z.array(hostSchema).min(1).max(FIRSTPARTY_MAX_API_HOSTS),
        token: hostSchema,
      })
      .strict(),
  })
  .strict();

export type FirstpartyCatalogEntry = z.infer<typeof firstpartyCatalogEntrySchema>;

export const sourceCatalogResponseSchema = z
  .object({
    enabledKinds: z.array(z.string()),
    firstparty: z
      .array(firstpartyCatalogEntrySchema)
      .max(FIRSTPARTY_MAX_LIVE_CONNECTORS)
      .optional(),
  })
  .strict();

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

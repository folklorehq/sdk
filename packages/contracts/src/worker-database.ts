// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const AWS_ARN_MAX_LENGTH = 2_048;
const SECRETS_MANAGER_VERSION_ID_MIN_LENGTH = 32;
const SECRETS_MANAGER_VERSION_ID_MAX_LENGTH = 64;
const databaseEndpointHostSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
  );
const databaseNameSchema = z
  .string()
  .min(1)
  .max(63)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/);
const secretsManagerVersionIdSchema = z
  .string()
  .min(SECRETS_MANAGER_VERSION_ID_MIN_LENGTH)
  .max(SECRETS_MANAGER_VERSION_ID_MAX_LENGTH)
  .regex(/^[A-Za-z0-9-]+$/);
const secretArnSchema = z
  .string()
  .max(AWS_ARN_MAX_LENGTH)
  .regex(
    /^arn:[a-z0-9-]+:secretsmanager:[a-z0-9-]+:\d{12}:secret:[A-Za-z0-9/_+=.@-]*-[A-Za-z0-9]{6}$/,
  );

export const workerDatabaseConfigSchema = z
  .object({
    version: z.literal(1),
    endpoint: z
      .object({
        host: databaseEndpointHostSchema,
        port: z.number().int().min(1).max(65_535),
      })
      .strict(),
    database: databaseNameSchema,
    secretArn: secretArnSchema,
    secretVersionId: secretsManagerVersionIdSchema,
  })
  .strict();

export type WorkerDatabaseConfig = z.infer<typeof workerDatabaseConfigSchema>;

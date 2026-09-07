// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { workerDatabaseConfigSchema } from '../src/worker-database.js';

const valid = {
  version: 1 as const,
  endpoint: { host: 'db.example.us-east-1.rds.amazonaws.com', port: 5432 },
  database: 'folklore',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:worker-db-AbCd12',
  secretVersionId: 'a'.repeat(32),
};

describe('worker database metadata contract', () => {
  it('accepts pinned endpoint and secret references', () => {
    expect(workerDatabaseConfigSchema.parse(valid)).toEqual(valid);
  });

  it('rejects envelope-shaped or unknown fields at every level', () => {
    expect(workerDatabaseConfigSchema.safeParse({ ...valid, envelope: {} }).success).toBe(false);
    expect(
      workerDatabaseConfigSchema.safeParse({ ...valid, managementSecretArn: valid.secretArn })
        .success,
    ).toBe(false);
    expect(
      workerDatabaseConfigSchema.safeParse({
        ...valid,
        endpoint: { ...valid.endpoint, extra: true },
      }).success,
    ).toBe(false);
    expect(workerDatabaseConfigSchema.safeParse({ ...valid, extra: true }).success).toBe(false);
  });

  it('rejects endpoint injection, invalid ports, database injection, and bad references', () => {
    for (const host of [
      'https://db.example.com',
      'user:pass@db.example.com',
      'db.example.com/path',
      'db.example.com?x=1',
    ]) {
      expect(
        workerDatabaseConfigSchema.safeParse({ ...valid, endpoint: { ...valid.endpoint, host } })
          .success,
      ).toBe(false);
    }
    for (const port of [0, 65536, 5432.5]) {
      expect(
        workerDatabaseConfigSchema.safeParse({ ...valid, endpoint: { ...valid.endpoint, port } })
          .success,
      ).toBe(false);
    }
    expect(
      workerDatabaseConfigSchema.safeParse({ ...valid, database: 'folklore;drop' }).success,
    ).toBe(false);
    expect(
      workerDatabaseConfigSchema.safeParse({
        ...valid,
        secretArn: 'arn:aws:secretsmanager:us-east-1:bad:secret:x',
      }).success,
    ).toBe(false);
    expect(
      workerDatabaseConfigSchema.safeParse({ ...valid, secretVersionId: 'short' }).success,
    ).toBe(false);
  });

  it('requires the literal version and all pinned fields', () => {
    expect(workerDatabaseConfigSchema.safeParse({ ...valid, version: 2 }).success).toBe(false);
    const { endpoint, ...withoutEndpoint } = valid;
    const { database, ...withoutDatabase } = valid;
    const { secretArn, ...withoutSecretArn } = valid;
    const { secretVersionId, ...withoutSecretVersionId } = valid;
    expect(workerDatabaseConfigSchema.safeParse(withoutEndpoint).success).toBe(false);
    expect(workerDatabaseConfigSchema.safeParse(withoutDatabase).success).toBe(false);
    expect(workerDatabaseConfigSchema.safeParse(withoutSecretArn).success).toBe(false);
    expect(workerDatabaseConfigSchema.safeParse(withoutSecretVersionId).success).toBe(false);
  });
});

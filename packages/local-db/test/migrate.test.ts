// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('local-db migrations', () => {
  it('ships baseline and AGE graph DDL', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const migrations = join(here, '../src/migrations');
    expect(readFileSync(join(migrations, '001_local_baseline.sql'), 'utf8')).toContain(
      'local_facts',
    );
    expect(readFileSync(join(migrations, '002_age_graph.sql'), 'utf8')).toContain('create_graph');
  });
});

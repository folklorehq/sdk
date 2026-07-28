// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { initProject, readProjectConfig } from '../src/commands/init.js';

describe('folklore init', () => {
  it('writes a default config file once', () => {
    const dir = mkdtempSync(join(tmpdir(), 'folklore-init-'));
    const first = initProject(dir);
    expect(first.created).toBe(true);
    expect(existsSync(first.configPath)).toBe(true);

    const second = initProject(dir);
    expect(second.created).toBe(false);

    const config = readProjectConfig(dir);
    expect(config.databaseUrl).toContain('postgres://');
    expect(readFileSync(first.configPath, 'utf8')).toContain('"version": 1');
  });
});

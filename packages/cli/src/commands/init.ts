// SPDX-License-Identifier: Apache-2.0
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface FolkloreInitConfig {
  version: 1;
  orgId: string;
  databaseUrl: string;
  redisUrl: string;
  indexPath?: string;
  userId?: string;
}

const DEFAULT_CONFIG: FolkloreInitConfig = {
  version: 1,
  orgId: '00000000-0000-0000-0000-000000000001',
  databaseUrl: 'postgres://folklore:folklore@localhost:5432/folklore',
  redisUrl: 'redis://localhost:6379',
};

export function initProject(
  cwd: string,
  dirName = '.folklore',
): { configPath: string; created: boolean } {
  const configDir = join(resolve(cwd), dirName);
  const configPath = join(configDir, 'config.json');
  if (existsSync(configPath)) {
    return { configPath, created: false };
  }
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`);
  return { configPath, created: true };
}

export function readProjectConfig(cwd: string, dirName = '.folklore'): FolkloreInitConfig {
  const configPath = join(resolve(cwd), dirName, 'config.json');
  return JSON.parse(readFileSync(configPath, 'utf8')) as FolkloreInitConfig;
}

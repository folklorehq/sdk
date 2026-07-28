#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { Command } from 'commander';
import { runConnectorTest } from './commands/connector-test.js';
import { runIngest } from './commands/ingest.js';
import { initProject, readProjectConfig } from './commands/init.js';
import { runQuery } from './commands/query.js';
import { runVerifyAttestation } from './commands/verify-attestation.js';
import { migrateLocalDatabase } from '@folklore/local-db';

const program = new Command();

program.name('folklore').description('Folklore local development CLI');

program
  .command('init')
  .description('Scaffold a local .folklore/config.json for local development')
  .option('--dir <name>', 'config directory name', '.folklore')
  .option('--migrate', 'apply the local Postgres schema after creating config')
  .action(async (options: { dir: string; migrate?: boolean }) => {
    const { configPath, created } = initProject(process.cwd(), options.dir);
    if (created) {
      process.stdout.write(`Created ${configPath}\n`);
    } else {
      process.stdout.write(`Config already exists at ${configPath}\n`);
    }
    if (options.migrate) {
      const config = readProjectConfig(process.cwd(), options.dir);
      await migrateLocalDatabase(config.databaseUrl);
      process.stdout.write('Applied local database schema\n');
    }
  });

program
  .command('ingest')
  .description('Load a normalized corpus fixture into local Postgres and build a vector index')
  .requiredOption('--fixture <path>', 'path to corpus JSON (see examples/corpus.json)')
  .action(async (options: { fixture: string }) => {
    const result = await runIngest({ cwd: process.cwd(), fixturePath: options.fixture });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

program
  .command('query')
  .description('Search the local vector index built by folklore ingest')
  .argument('<text>', 'natural-language query')
  .option('--limit <n>', 'max hits', '5')
  .action(async (text: string, options: { limit: string }) => {
    const result = await runQuery({
      cwd: process.cwd(),
      query: text,
      limit: Number(options.limit),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  });

program
  .command('verify-attestation')
  .description('Validate attestation.json PCR0 fields (optional EIF cross-check)')
  .option('--attestation <path>', 'path to attestation.json', 'attestation.json')
  .option('--commit <sha>', 'expected git commit in attestation.json')
  .option('--eif <path>', 'local EIF file to compare via nitro-cli describe-eif')
  .action((options: { attestation: string; commit?: string; eif?: string }) => {
    runVerifyAttestation({
      attestationPath: options.attestation,
      commit: options.commit,
      eifPath: options.eif,
    });
  });

const connector = program.command('connector').description('Connector SDK helpers');

connector
  .command('test')
  .description('Normalize a fixture payload through a registered connector')
  .requiredOption('--kind <kind>', 'source kind, e.g. github')
  .requiredOption('--event-type <type>', 'webhook event type')
  .requiredOption('--fixture <path>', 'path to JSON fixture payload')
  .action((options: { kind: string; eventType: string; fixture: string }) => {
    const records = runConnectorTest({
      kind: options.kind,
      eventType: options.eventType,
      fixturePath: options.fixture,
    });
    process.stdout.write(`${JSON.stringify(records, null, 2)}\n`);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});

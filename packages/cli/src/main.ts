#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
import { Command } from 'commander';
import { runConnectorTest } from './commands/connector-test.js';
import { initProject } from './commands/init.js';
import { runVerifyAttestation } from './commands/verify-attestation.js';

const program = new Command();

program.name('folklore').description('Folklore connector SDK CLI');

program
  .command('init')
  .description('Scaffold a local .folklore/config.json for connector development')
  .option('--dir <name>', 'config directory name', '.folklore')
  .action((options: { dir: string }) => {
    const { configPath, created } = initProject(process.cwd(), options.dir);
    if (created) {
      process.stdout.write(`Created ${configPath}\n`);
    } else {
      process.stdout.write(`Config already exists at ${configPath}\n`);
    }
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

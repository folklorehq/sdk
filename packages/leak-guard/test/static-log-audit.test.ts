// SPDX-License-Identifier: Apache-2.0
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditLogSource, auditProductionLogs } from '../src/static-log-audit.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('static production log audit', () => {
  it('accepts a safe direct logger call', () => {
    expect(
      auditLogSource('fixture.ts', "logger.info('worker_started', { generation: 3 });"),
    ).toEqual([]);
  });

  it('rejects an unsafe logger call through a receiver alias', () => {
    expect(
      auditLogSource(
        'fixture.ts',
        "const log = logger; log.info('worker_started', { version: '1.0.0' });",
      ),
    ).toEqual([{ file: 'fixture.ts', line: 1, reason: 'invalid_context_key' }]);
  });

  it('rejects an unsafe logger call through a method alias', () => {
    expect(
      auditLogSource(
        'fixture.ts',
        'const { info } = logger; info(`worker_${phase}`, { generation: 3 });',
      ),
    ).toEqual([{ file: 'fixture.ts', line: 1, reason: 'invalid event' }]);
  });

  it.each([
    "console['error'](secret);",
    'globalThis.console.error(secret);',
    'const output = console; output.error(secret);',
    'const output = console.error; output(secret);',
    'const output = console.error.bind(console); output(secret);',
    'process.stderr.write(secret);',
  ])('rejects indirect console and stderr bypasses: %s', (source) => {
    expect(auditLogSource('fixture.ts', source)).toEqual([
      { file: 'fixture.ts', line: 1, reason: 'console bypass' },
    ]);
  });

  it('rejects an unsafe computed logger call', () => {
    expect(
      auditLogSource('fixture.ts', "logger['info']('worker_started', { version: '1.0.0' });"),
    ).toEqual([{ file: 'fixture.ts', line: 1, reason: 'invalid_context_key' }]);
  });

  it.each([
    "const log = pino(); log.info('worker_started', { version: '1.0.0' });",
    "const log = new PinoLogger(); log.info('worker_started', { version: '1.0.0' });",
  ])('rejects an unsafe direct logger adapter call: %s', (source) => {
    expect(auditLogSource('fixture.ts', source)).toEqual([
      { file: 'fixture.ts', line: 1, reason: 'invalid_context_key' },
    ]);
  });

  it('rejects a dynamic value under an otherwise approved context key', () => {
    expect(
      auditLogSource(
        'fixture.ts',
        "const status = decryptedContent; const log = pino(); log.info('worker_started', { status });",
      ),
    ).toEqual([{ file: 'fixture.ts', line: 1, reason: 'invalid_context_value' }]);
  });

  it('rejects a bound raw-Pino method with a dynamic value', () => {
    expect(
      auditLogSource(
        'fixture.ts',
        "const status = decryptedContent; const log = pino(); const info = log.info.bind(log); info('worker_started', { status });",
      ),
    ).toEqual([{ file: 'fixture.ts', line: 1, reason: 'invalid_context_value' }]);
  });

  it('rejects a bound raw-Pino child method with a dynamic value', () => {
    expect(
      auditLogSource(
        'fixture.ts',
        "const status = decryptedContent; const log = pino().child({ component: 'worker' }); const info = log.info.bind(log); info('worker_started', { status });",
      ),
    ).toEqual([{ file: 'fixture.ts', line: 1, reason: 'invalid_context_value' }]);
  });

  it.each([
    "import createLog from 'pino'; const status = decryptedContent; const output = createLog(); output.info('worker_started', { status });",
    "import { pino as createLog } from 'pino'; const status = decryptedContent; const output = createLog(); output.info('worker_started', { status });",
    "import * as pinoModule from 'pino'; const status = decryptedContent; const output = pinoModule.default(); output.info('worker_started', { status });",
    "import createLog from 'pino'; const renamedFactory = createLog; const status = decryptedContent; const output = renamedFactory(); output.info('worker_started', { status });",
  ])('rejects dynamic content through an aliased raw-Pino factory: %s', (source) => {
    expect(auditLogSource('fixture.ts', source)).toEqual([
      { file: 'fixture.ts', line: 1, reason: 'invalid_context_value' },
    ]);
  });

  it('rejects dynamic content through a bound and transitively aliased raw-Pino factory', () => {
    expect(
      auditLogSource(
        'fixture.ts',
        "import createLog from 'pino'; const boundFactory = createLog.bind(null); const transitiveFactory = boundFactory; const status = decryptedContent; const output = transitiveFactory(); output.info('worker_started', { status });",
      ),
    ).toEqual([{ file: 'fixture.ts', line: 1, reason: 'invalid_context_value' }]);
  });

  it('audits every app and package production source tree', () => {
    expect(auditProductionLogs(ROOT)).toEqual([]);
  }, 60_000);

  it('tolerates a root without an apps directory (product mirror layout)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'log-audit-'));
    try {
      expect(auditProductionLogs(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

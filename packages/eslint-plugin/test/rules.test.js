import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RuleTester } from 'eslint';
import plugin from '../index.js';

const tester = new RuleTester();

test('plugin exposes all rules', () => {
  assert.ok(plugin.rules['no-banner-comments']);
  assert.ok(plugin.rules['no-doc-comment-body']);
  assert.ok(plugin.rules['no-content-in-sinks']);
  assert.ok(plugin.rules['no-layer-dir-files']);
});

test('no-content-in-sinks flags content identifiers reaching a sink, allows metadata', () => {
  tester.run('no-content-in-sinks', plugin.rules['no-content-in-sinks'], {
    valid: [
      "logger.info('persisted', { factId, orgId })",
      "cache.set(key, factId)",
      "telemetry.track('fact.ingested', orgId, { sourceKind })",
      "logger.error('failed', { id: msg.MessageId })",
    ],
    invalid: [
      {
        code: "logger.info('body', { plaintext })",
        errors: [{ messageId: 'contentInSink' }],
      },
      {
        code: "cache.set(key, decryptedBody)",
        errors: [{ messageId: 'contentInSink' }],
      },
      {
        code: "telemetry.track('x', id, { text: wikiText })",
        errors: [{ messageId: 'contentInSink' }],
      },
      {
        code: "logger.warn(`leaked ${factBody}`)",
        errors: [{ messageId: 'contentInSink' }],
      },
    ],
  });
});

test('no-banner-comments flags and fixes dividers, allows why-comments', () => {
  tester.run('no-banner-comments', plugin.rules['no-banner-comments'], {
    valid: [
      'const a = 1; // why: upstream returns -1 on miss',
      'const b = 2; // a == b comparison guard',
      '/** One line contract. */\nexport const c = 3;',
    ],
    invalid: [
      {
        code: 'const a = 1;\n// ── step 2: do the thing ──\nconst b = 2;',
        output: 'const a = 1;\nconst b = 2;',
        errors: [{ messageId: 'banner' }],
      },
      {
        code: '// --- helpers ---\nconst a = 1;',
        output: 'const a = 1;',
        errors: [{ messageId: 'banner' }],
      },
      {
        code: 'const a = 1;\n// ================\nconst b = 2;',
        output: 'const a = 1;\nconst b = 2;',
        errors: [{ messageId: 'banner' }],
      },
    ],
  });
});

test('no-doc-comment-body flags multi-line bodies, allows one-liners and tags', () => {
  tester.run('no-doc-comment-body', plugin.rules['no-doc-comment-body'], {
    valid: [
      '/** Resolves the audience grant. */\nexport const a = 1;',
      '/**\n * Resolves the audience grant.\n * @param id the audience id\n */\nexport const b = 2;',
      '// not a jsdoc block\nconst c = 3;',
    ],
    invalid: [
      {
        code: '/**\n * Loads the row.\n * Then maps it to a DTO and returns it.\n */\nexport const a = 1;',
        errors: [{ messageId: 'docBody' }],
      },
    ],
  });
});

test('plugin exposes rules', () => {
  assert.ok(plugin.rules['no-orm-prefixed-classes']);
  assert.ok(plugin.rules['no-test-doubles-in-src']);
  assert.ok(plugin.rules['no-src-imports-from-test']);
  assert.ok(plugin.rules['filename-matches-export']);
  assert.ok(plugin.rules['max-files-per-domain-dir']);
});

test('no-orm-prefixed-classes flags Drizzle/Postgres classes, allows carve-outs', () => {
  tester.run('no-orm-prefixed-classes', plugin.rules['no-orm-prefixed-classes'], {
    valid: [
      'export class OrganizationRepository {}',
      'export class DrizzleDb {}',
      'export class PostgresHealthCheck {}',
    ],
    invalid: [
      {
        code: 'export class DrizzleOrganizationRepository {}',
        errors: [{ messageId: 'ormPrefix' }],
      },
      {
        code: 'export class PostgresMembershipRepository {}',
        errors: [{ messageId: 'ormPrefix' }],
      },
    ],
  });
});

test('filename-matches-export requires PascalCase for a single exported class', () => {
  tester.run('filename-matches-export', plugin.rules['filename-matches-export'], {
    valid: [
      {
        code: 'export class Foo {}',
        filename: '/repo/packages/x/src/Foo.ts',
      },
      {
        code: 'export const helper = 1;',
        filename: '/repo/packages/x/src/helper.ts',
      },
      {
        code: 'export const x = 1;',
        filename: '/repo/packages/x/src/types.ts',
      },
    ],
    invalid: [
      {
        code: 'export class Foo {}',
        filename: '/repo/packages/x/src/foo.ts',
        errors: [{ messageId: 'shouldBePascal' }],
      },
    ],
  });
});

test('no-src-imports-from-test flags climbing into test/', () => {
  tester.run('no-src-imports-from-test', plugin.rules['no-src-imports-from-test'], {
    valid: [
      {
        code: "import { x } from './nearby.js'",
        filename: '/repo/apps/a/src/foo.ts',
      },
    ],
    invalid: [
      {
        code: "import { x } from '../test/doubles/x.js'",
        filename: '/repo/apps/a/src/foo.ts',
        errors: [{ messageId: 'srcImportsTest' }],
      },
    ],
  });
});

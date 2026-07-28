import { basename } from 'node:path';

const BANNED_BASENAME =
  /^(mock-|fake-|stub-|.*-double\.ts$|.*-fake\.ts$|.*-mock\.ts$|Mock[A-Z]|Fake[A-Z])/i;

const ALLOWLIST = new Set([
  // HTTP not-implemented placeholders — not test scaffolding
  'stub-handlers.ts',
]);

export const noTestDoublesInSrc = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow test-double filenames under src/; use test/doubles/<domain>/ or repositories/in-memory/',
    },
    schema: [],
    messages: {
      doubleInSrc:
        'Test double under src/: move to test/doubles/<domain>/, or name prod/dev adapters InMemory* under repositories/in-memory/.',
    },
  },
  create(context) {
    const normalized = context.filename.replace(/\\/g, '/');
    if (!normalized.includes('/src/')) return {};
    if (normalized.includes('/repositories/in-memory/')) return {};
    const name = basename(normalized);
    if (ALLOWLIST.has(name)) return {};
    if (!BANNED_BASENAME.test(name)) return {};
    // InMemory* adapters are production/dev composition-root adapters, not doubles
    if (/^InMemory[A-Z]/.test(name)) return {};
    return {
      Program(node) {
        context.report({ node, messageId: 'doubleInSrc' });
      },
    };
  },
};

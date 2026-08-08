import { readdirSync, statSync } from 'node:fs';
import { dirname, basename } from 'node:path';

const DEFAULT_MAX = 12;
const ROLE_DIRS = new Set([
  'repositories',
  'handlers',
  'services',
  'routes',
  'in-memory',
  'schema',
  'components',
  'pages',
  'lambda',
]);

export const maxFilesPerDomainDir = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Warn when a domain directory holds too many sibling source files; split by sub-domain',
    },
    schema: [
      {
        type: 'object',
        properties: { max: { type: 'integer', minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      tooMany:
        'Domain dir "{{dir}}" has {{count}} sibling source files (max {{max}}). Split by sub-domain — do not re-add top-level layer dirs.',
    },
  },
  create(context) {
    const max = context.options[0]?.max ?? DEFAULT_MAX;
    const normalized = context.filename.replace(/\\/g, '/');
    if (!normalized.includes('/src/')) return {};
    if (normalized.includes('/node_modules/') || normalized.includes('/dist/')) return {};

    const dir = dirname(context.filename);
    const dirName = basename(dir);
    // Role/entity leaves and known flat-by-design folders are not domain piles
    if (ROLE_DIRS.has(dirName)) return {};

    let count = 0;
    try {
      for (const name of readdirSync(dir)) {
        if (!/\.(tsx?|jsx?)$/.test(name)) continue;
        if (name.endsWith('.d.ts')) continue;
        const abs = `${dir}/${name}`;
        if (statSync(abs).isFile()) count += 1;
      }
    } catch {
      return {};
    }

    if (count <= max) return {};

    return {
      Program(node) {
        context.report({
          node,
          messageId: 'tooMany',
          data: { dir: dirName, count: String(count), max: String(max) },
        });
      },
    };
  },
};

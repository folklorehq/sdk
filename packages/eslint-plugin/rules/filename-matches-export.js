import { basename } from 'node:path';

const SKIP = new Set([
  'index.ts',
  'types.ts',
  'ports.ts',
  'ports-public.ts',
  'schema.ts',
  'env.ts',
  'errors.ts',
]);

/** Sole exported class (or React component in .tsx) → PascalCase filename. */
export const filenameMatchesExport = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'File name mirrors its primary export: sole class/component → PascalCase; else kebab-case',
    },
    schema: [],
    messages: {
      shouldBePascal:
        'Primary export is class/component "{{name}}" — rename file to {{name}}.{{ext}}.',
      shouldMatch:
        'PascalCase file "{{file}}" must export a class or component named "{{stem}}".',
    },
  },
  create(context) {
    const normalized = context.filename.replace(/\\/g, '/');
    if (!normalized.includes('/src/')) return {};
    if (normalized.includes('/test/') || normalized.endsWith('.d.ts')) return {};
    const file = basename(normalized);
    if (SKIP.has(file)) return {};
    const stem = file.replace(/\.(tsx?|jsx?)$/, '');
    const ext = file.endsWith('.tsx') ? 'tsx' : 'ts';
    const isPascal = /^[A-Z][A-Za-z0-9]*$/.test(stem);
    const isTsx = file.endsWith('.tsx');

    const classOrComponent = [];
    let otherValueExports = 0;

    return {
      ExportNamedDeclaration(node) {
        if (node.exportKind === 'type') return;
        const decl = node.declaration;
        if (!decl) {
          // bare `export { Foo }` — unknown kind; count as other to avoid false positives
          if (node.specifiers.length > 0) otherValueExports += 1;
          return;
        }
        if (decl.type === 'TSTypeAliasDeclaration' || decl.type === 'TSInterfaceDeclaration') return;
        if (decl.type === 'ClassDeclaration' && decl.id?.name) {
          classOrComponent.push(decl.id.name);
          return;
        }
        if (isTsx && decl.type === 'FunctionDeclaration' && decl.id?.name && /^[A-Z]/.test(decl.id.name)) {
          classOrComponent.push(decl.id.name);
          return;
        }
        if (isTsx && decl.type === 'VariableDeclaration') {
          for (const d of decl.declarations) {
            if (d.id.type === 'Identifier' && /^[A-Z]/.test(d.id.name)) {
              classOrComponent.push(d.id.name);
            } else {
              otherValueExports += 1;
            }
          }
          return;
        }
        if (decl.type === 'FunctionDeclaration' || decl.type === 'VariableDeclaration') {
          otherValueExports += 1;
        }
      },
      ExportDefaultDeclaration(node) {
        const d = node.declaration;
        if (d.type === 'ClassDeclaration' && d.id?.name) {
          classOrComponent.push(d.id.name);
          return;
        }
        if (isTsx && d.type === 'FunctionDeclaration' && d.id?.name && /^[A-Z]/.test(d.id.name)) {
          classOrComponent.push(d.id.name);
          return;
        }
        otherValueExports += 1;
      },
      'Program:exit'(node) {
        const unique = [...new Set(classOrComponent)];
        const sole = unique.length === 1 && otherValueExports === 0 ? unique[0] : null;

        if (sole) {
          if (file !== `${sole}.${ext}`) {
            context.report({ node, messageId: 'shouldBePascal', data: { name: sole, ext } });
          }
          return;
        }

        if (isPascal && unique.length > 0 && !unique.includes(stem)) {
          context.report({ node, messageId: 'shouldMatch', data: { file, stem } });
        }
      },
    };
  },
};

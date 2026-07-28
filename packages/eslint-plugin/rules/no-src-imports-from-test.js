export const noSrcImportsFromTest = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow src/** importing from test/**',
    },
    schema: [],
    messages: {
      srcImportsTest:
        'src/ must not import test/. Move shared doubles to a composition-root adapter or keep them under test/doubles/.',
    },
  },
  create(context) {
    const normalized = context.filename.replace(/\\/g, '/');
    if (!normalized.includes('/src/')) return {};

    function check(node, source) {
      if (typeof source !== 'string') return;
      if (
        source.includes('../test/') ||
        source.includes('/test/') ||
        /(?:^|[./])(?:\.\.\/)+test\//.test(source)
      ) {
        context.report({ node, messageId: 'srcImportsTest' });
      }
    }

    return {
      ImportDeclaration(node) {
        check(node.source, node.source.value);
      },
      ImportExpression(node) {
        if (node.source.type === 'Literal') check(node.source, node.source.value);
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'require' &&
          node.arguments[0]?.type === 'Literal'
        ) {
          check(node.arguments[0], node.arguments[0].value);
        }
      },
    };
  },
};

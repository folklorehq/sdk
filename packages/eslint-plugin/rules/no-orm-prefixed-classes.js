const FORBIDDEN = /^(Drizzle|Postgres)[A-Z]/;
// <Tech><Role> adapters with 2+ production backends / DB drivers — carve-out
const ALLOWLIST = new Set(['DrizzleDb', 'PostgresHealthCheck']);

export const noOrmPrefixedClasses = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ORM/tech-prefixed repository class names; ports use Port suffix, adapters take the clean name',
    },
    schema: [],
    messages: {
      ormPrefix:
        'ORM/tech-prefixed class "{{name}}": drop the prefix — adapters are <Domain>Repository; carve-out only for {{allow}}.',
    },
  },
  create(context) {
    return {
      ClassDeclaration(node) {
        const name = node.id?.name;
        if (!name || ALLOWLIST.has(name) || !FORBIDDEN.test(name)) return;
        context.report({
          node: node.id,
          messageId: 'ormPrefix',
          data: { name, allow: [...ALLOWLIST].join(', ') },
        });
      },
    };
  },
};

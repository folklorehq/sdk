const LAYER_DIR = /\/src\/(routes|services|repositories)\//;

export const noLayerDirFiles = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow source files under layer dirs (routes/services/repositories); use src/<domain>/',
    },
    schema: [],
    messages: {
      layerDir: 'Layer dir file: colocate under src/<domain>/, not src/{{layer}}/.',
    },
  },
  create(context) {
    const normalized = context.filename.replace(/\\/g, '/');
    const match = normalized.match(LAYER_DIR);
    if (!match) return {};

    const layer = match[1];
    return {
      Program(node) {
        context.report({
          node,
          messageId: 'layerDir',
          data: { layer },
        });
      },
    };
  },
};

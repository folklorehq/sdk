// Flags a decrypted-content identifier flowing into a log, cache, or telemetry sink.
// Deliberately narrow: it matches only unambiguous content variable names, so it is a hard error
// with near-zero false positives — the broad structural sweep lives in leak-guard's leak-scan.
const SINK_METHODS = new Set([
  'set',
  'track',
  'capture',
  'captureError',
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

const CONTENT_NAME =
  /^(?:plaintext|decrypted|decryptedBody|clearText|cleartext|factBody|wikiText|rawBody|bodyText|messageText)$/i;

function isContentIdentifier(node) {
  if (!node) return false;
  if (node.type === 'Identifier') return CONTENT_NAME.test(node.name);
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    return CONTENT_NAME.test(node.property.name);
  }
  return false;
}

function argumentLeaksContent(arg) {
  if (arg.type === 'SpreadElement') return isContentIdentifier(arg.argument);
  if (isContentIdentifier(arg)) return true;
  if (arg.type === 'ObjectExpression') {
    return arg.properties.some((p) => p.type === 'Property' && isContentIdentifier(p.value));
  }
  if (arg.type === 'TemplateLiteral') {
    return arg.expressions.some(isContentIdentifier);
  }
  return false;
}

export const noContentInSinks = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow a decrypted-content identifier flowing into a log/cache/telemetry sink',
    },
    schema: [],
    messages: {
      contentInSink:
        'A decrypted-content value must never reach a "{{method}}" sink — logs, cache, and telemetry must stay content-free.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return;
        if (!SINK_METHODS.has(callee.property.name)) return;
        if (node.arguments.some(argumentLeaksContent)) {
          context.report({
            node,
            messageId: 'contentInSink',
            data: { method: callee.property.name },
          });
        }
      },
    };
  },
};

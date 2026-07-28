const MAX_PROSE_LINES = 1;

function proseLineCount(commentValue) {
  const body = commentValue.replace(/^\*/, '');
  let count = 0;
  for (const rawLine of body.split('\n')) {
    const line = rawLine.replace(/^\s*\*? ?/, '').trim();
    if (line === '') continue;
    if (line.startsWith('@')) break;
    count += 1;
  }
  return count;
}

function isJsDocBlock(comment) {
  return comment.type === 'Block' && comment.value.startsWith('*');
}

export const noDocCommentBody = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow multi-line JSDoc bodies that paraphrase the implementation (style.md: one short contract line)',
    },
    schema: [],
    messages: {
      docBody:
        'JSDoc body paraphrases the implementation. One short line on the contract is enough (style.md).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (!isJsDocBlock(comment)) continue;
          if (proseLineCount(comment.value) <= MAX_PROSE_LINES) continue;
          context.report({ loc: comment.loc, messageId: 'docBody' });
        }
      },
    };
  },
};

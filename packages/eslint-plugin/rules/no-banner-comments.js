const BOX_DIVIDER_RUN = /[─━—–═╌╍┄┅]{2,}/;
const ASCII_DIVIDER_RUN = /[-=*#_~•·]{3,}/;
const PURE_DIVIDER_LINE = /^[\s─━—–═╌╍┄┅\-=*#_~•·]+$/;
const MIN_PURE_DIVIDER_CHARS = 3;

function isBannerComment(text) {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  if (BOX_DIVIDER_RUN.test(trimmed)) return true;
  if (ASCII_DIVIDER_RUN.test(trimmed)) return true;
  if (PURE_DIVIDER_LINE.test(trimmed)) {
    const dividerCharCount = trimmed.replace(/\s/g, '').length;
    return dividerCharCount >= MIN_PURE_DIVIDER_CHARS;
  }
  return false;
}

function removeCommentFix(sourceCode, comment) {
  return (fixer) => {
    const source = sourceCode.getText();
    const [start, end] = comment.range;
    let lineStart = start;
    while (lineStart > 0 && source[lineStart - 1] !== '\n') lineStart -= 1;
    let lineEnd = end;
    while (lineEnd < source.length && source[lineEnd] !== '\n') lineEnd += 1;
    const before = source.slice(lineStart, start);
    const after = source.slice(end, lineEnd);
    if (before.trim() === '' && after.trim() === '') {
      const removeEnd = lineEnd < source.length ? lineEnd + 1 : lineEnd;
      return fixer.removeRange([lineStart, removeEnd]);
    }
    return fixer.removeRange([before.trimEnd().length < before.length ? start - 1 : start, end]);
  };
}

export const noBannerComments = {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow section-divider and step-banner comments (style.md: named helpers carry that structure)',
    },
    fixable: 'code',
    schema: [],
    messages: {
      banner:
        'Banner/divider comment. Structure comes from file layout and helper names, not comment art (style.md).',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      Program() {
        for (const comment of sourceCode.getAllComments()) {
          if (!isBannerComment(comment.value)) continue;
          context.report({
            loc: comment.loc,
            messageId: 'banner',
            fix: removeCommentFix(sourceCode, comment),
          });
        }
      },
    };
  },
};

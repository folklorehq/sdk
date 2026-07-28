const BULLET_PREFIX = '- ';
const HEADING_PREFIX = '#';
const BLOCK_SEPARATOR = '\n\n';
// User-authorable ADF nesting is unbounded; cap descent so a pathological doc truncates
// rather than throwing RangeError inside the enclave normalize step and failing the batch.
const MAX_DEPTH = 50;
/** Flatten an Atlassian Document Format tree to plain markdown-ish text for a Fact body. */
export function adfToText(node) {
    if (!node)
        return '';
    return renderNode(node, 0).trim();
}
function renderNode(node, depth) {
    if (depth >= MAX_DEPTH)
        return node.text ?? '';
    switch (node.type) {
        case 'doc':
            return renderBlocks(node.content, depth);
        case 'paragraph':
            return renderInline(node.content, depth);
        case 'heading':
            return `${headingPrefix(node)} ${renderInline(node.content, depth)}`;
        case 'blockquote':
            return renderBlocks(node.content, depth);
        case 'bulletList':
        case 'orderedList':
            return renderList(node, depth);
        case 'listItem':
            return renderInline(node.content, depth);
        case 'codeBlock':
            return renderInline(node.content, depth);
        case 'rule':
            return '';
        case 'text':
            return applyLinkMark(node);
        case 'hardBreak':
            return '\n';
        case 'mention':
            return mentionText(node);
        case 'emoji':
            return emojiText(node);
        case 'inlineCard':
        case 'blockCard':
            return cardUrl(node);
        default:
            return node.content ? renderInline(node.content, depth) : (node.text ?? '');
    }
}
function renderBlocks(children, depth) {
    if (!children)
        return '';
    return children
        .map((child) => renderNode(child, depth + 1))
        .filter((block) => block.length > 0)
        .join(BLOCK_SEPARATOR);
}
function renderInline(children, depth) {
    if (!children)
        return '';
    return children.map((child) => renderNode(child, depth + 1)).join('');
}
function renderList(node, depth) {
    const items = node.content ?? [];
    return items.map((item) => `${BULLET_PREFIX}${renderNode(item, depth + 1)}`).join('\n');
}
function headingPrefix(node) {
    const level = Number(node.attrs?.['level'] ?? 1);
    const clamped = Math.min(Math.max(level, 1), 6);
    return HEADING_PREFIX.repeat(clamped);
}
function applyLinkMark(node) {
    const text = node.text ?? '';
    const link = node.marks?.find((mark) => mark.type === 'link');
    const href = link?.attrs?.['href'];
    return typeof href === 'string' && href.length > 0 ? `${text} (${href})` : text;
}
function mentionText(node) {
    const label = node.attrs?.['text'];
    return typeof label === 'string' ? label : '';
}
function emojiText(node) {
    const short = node.attrs?.['text'] ?? node.attrs?.['shortName'];
    return typeof short === 'string' ? short : '';
}
function cardUrl(node) {
    const url = node.attrs?.['url'];
    return typeof url === 'string' ? url : '';
}
//# sourceMappingURL=adf-to-text.js.map
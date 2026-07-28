// SPDX-License-Identifier: Apache-2.0
import fc from 'fast-check';
const ADVERSARIAL_FRAGMENTS = [
    'plain ascii secret',
    'unicode ‮RTL‬ override',
    'zero​width​joined',
    'combining áè marks',
    'homoglyph раyраl аpple',
    'emoji \u{1f512}\u{1f4b0}\u{1f3e2}',
    'newlines\nand\ttabs',
    'quotes "double" \'single\' `back`',
    'json {"nested":"value"}',
    'html <script>alert(1)</script>',
    "sql '; DROP TABLE facts;--",
];
/** An adversarial content string: ascii, unicode, control chars, encodings, or a long run. */
export function contentString() {
    return fc.oneof(fc.string({ minLength: 1, maxLength: 64 }), fc.fullUnicodeString({ minLength: 1, maxLength: 64 }), fc.constantFrom(...ADVERSARIAL_FRAGMENTS), fc.string({ minLength: 512, maxLength: 2048 }), fc
        .array(fc.fullUnicodeString({ minLength: 1, maxLength: 16 }), { minLength: 1, maxLength: 8 })
        .map((parts) => parts.join(' ')));
}
/** A content-named key an attacker (or a careless refactor) might smuggle text through. */
export function contentKey() {
    return fc.constantFrom('message', 'body', 'content', 'text', 'title', 'summary', 'description', 'query', 'prompt', 'email', 'stack', 'snippet', 'excerpt', 'name');
}
/** An arbitrarily nested payload of content strings — objects, arrays, and long primitives. */
export function contentPayload() {
    const leaf = fc.oneof(contentString(), fc.integer(), fc.boolean());
    return fc.oneof({ withCrossShrink: true }, leaf, fc.array(leaf, { maxLength: 6 }), fc.dictionary(fc.string({ minLength: 1, maxLength: 12 }), leaf, { maxKeys: 6 }), fc.array(fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), leaf, { maxKeys: 4 }), {
        maxLength: 4,
    }));
}
/** The marker wrapped in adversarial surroundings, so scanners must survive real-world noise. */
export function markerEmbeddedIn(marker) {
    return fc
        .tuple(contentString(), contentString())
        .map(([before, after]) => `${before}${marker}${after}`);
}
//# sourceMappingURL=content-arbitraries.js.map
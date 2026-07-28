/** Collapse internal whitespace runs to single spaces and trim the ends. */
export declare function collapseWhitespace(value: string): string;
/** Collapse whitespace, then cap length with a trailing ellipsis if needed. */
export declare function truncate(value: string, max: number): string;
/** Up to two leading letters of the space-separated words in a name. */
export declare function initials(name: string): string;
/** Escape a string for literal use inside a `RegExp`. */
export declare function escapeRegExp(value: string): string;
/** Extract lowercased mention target tokens (`@handle` / `fk-person:<slug>`) from plaintext. */
export declare function extractMentions(text: string): string[];
//# sourceMappingURL=text.d.ts.map
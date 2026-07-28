import fc from 'fast-check';
/** An adversarial content string: ascii, unicode, control chars, encodings, or a long run. */
export declare function contentString(): fc.Arbitrary<string>;
/** A content-named key an attacker (or a careless refactor) might smuggle text through. */
export declare function contentKey(): fc.Arbitrary<string>;
/** An arbitrarily nested payload of content strings — objects, arrays, and long primitives. */
export declare function contentPayload(): fc.Arbitrary<unknown>;
/** The marker wrapped in adversarial surroundings, so scanners must survive real-world noise. */
export declare function markerEmbeddedIn(marker: string): fc.Arbitrary<string>;
//# sourceMappingURL=content-arbitraries.d.ts.map
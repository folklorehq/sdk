// SPDX-License-Identifier: Apache-2.0
/** Render a numeric vector as a pgvector/halfvec literal: `[a,b,c]`. */
export function toVectorLiteral(values) {
    return `[${values.join(',')}]`;
}
//# sourceMappingURL=vector.js.map
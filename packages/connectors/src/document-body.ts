// SPDX-License-Identifier: Apache-2.0
export type DocumentBodyMode = 'off' | 'census' | 'ingest';

// UNWIRED: the cap and capDocumentBody have no caller yet.
export const DOCUMENT_BODY_CHAR_CAP = 32_000;

// Stands in for a keyed revision tag until the enclave substitutes it, so a connector never holds the key.
export const REVISION_TAG_PLACEHOLDER = '{rev}';

export function capDocumentBody(text: string): { body: string; truncated: boolean } {
  if (text.length <= DOCUMENT_BODY_CHAR_CAP) return { body: text, truncated: false };
  return { body: text.slice(0, DOCUMENT_BODY_CHAR_CAP), truncated: true };
}

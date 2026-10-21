// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DOCUMENT_BODY_CHAR_CAP,
  REVISION_TAG_PLACEHOLDER,
  capDocumentBody,
} from '../src/document-body.js';

describe('capDocumentBody', () => {
  it('returns a body at the cap unchanged', () => {
    const text = 'a'.repeat(DOCUMENT_BODY_CHAR_CAP);
    expect(capDocumentBody(text)).toEqual({ body: text, truncated: false });
  });

  it('cuts a body over the cap to the cap and says so', () => {
    const result = capDocumentBody('a'.repeat(DOCUMENT_BODY_CHAR_CAP + 1));
    expect(result.body).toHaveLength(DOCUMENT_BODY_CHAR_CAP);
    expect(result.truncated).toBe(true);
  });

  it('returns an empty body unchanged', () => {
    expect(capDocumentBody('')).toEqual({ body: '', truncated: false });
  });
});

describe('REVISION_TAG_PLACEHOLDER', () => {
  it('is the literal the enclave substitutes', () => {
    expect(REVISION_TAG_PLACEHOLDER).toBe('{rev}');
  });
});

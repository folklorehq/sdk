// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { sourceCatalogResponseSchema } from '../src/sources.js';

describe('sourceCatalogResponseSchema', () => {
  it('round-trips an enabledKinds list', () => {
    const parsed = sourceCatalogResponseSchema.parse({ enabledKinds: ['github', 'slack'] });
    expect(parsed).toEqual({ enabledKinds: ['github', 'slack'] });
  });

  it('parses an empty list', () => {
    expect(sourceCatalogResponseSchema.parse({ enabledKinds: [] })).toEqual({ enabledKinds: [] });
  });

  it('rejects unknown keys', () => {
    expect(() => sourceCatalogResponseSchema.parse({ enabledKinds: [], other: true })).toThrow();
  });
});

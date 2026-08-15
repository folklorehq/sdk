// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { sourceCapabilitiesResponseSchema, sourceCatalogResponseSchema } from '../src/sources.js';

describe('sourceCatalogResponseSchema', () => {
  it('preserves the legacy enabledKinds-only response exactly', () => {
    const parsed = sourceCatalogResponseSchema.parse({ enabledKinds: ['github', 'slack'] });
    expect(parsed).toEqual({ enabledKinds: ['github', 'slack'] });
  });

  it('parses an empty list', () => {
    expect(sourceCatalogResponseSchema.parse({ enabledKinds: [] })).toEqual({ enabledKinds: [] });
  });

  it('rejects unknown keys', () => {
    expect(() =>
      sourceCatalogResponseSchema.parse({
        enabledKinds: [],
        other: true,
      }),
    ).toThrow();
  });

  it('rejects a capability field added to the legacy response', () => {
    expect(() =>
      sourceCatalogResponseSchema.parse({ enabledKinds: [], codebaseAvailable: false }),
    ).toThrow();
  });
});

describe('sourceCapabilitiesResponseSchema', () => {
  it('requires an explicit Codebase availability decision', () => {
    expect(sourceCapabilitiesResponseSchema.parse({ codebaseAvailable: false })).toEqual({
      codebaseAvailable: false,
    });
  });

  it('rejects unknown fields', () => {
    expect(() =>
      sourceCapabilitiesResponseSchema.parse({ codebaseAvailable: true, enabledKinds: [] }),
    ).toThrow();
  });
});

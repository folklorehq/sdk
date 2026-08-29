// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import * as inference from '../src/index.js';

describe('@folklore/inference public API', () => {
  it('does not export legacy ACI verifier construction', () => {
    expect(inference).not.toHaveProperty('LegacyAciReportVerifier');
    expect(inference).not.toHaveProperty('LegacyAciSessionVerifier');
  });

  it('exports strict V2 session evidence bindings', () => {
    const binding: inference.VerifiedAciSessionEvidenceBindingsV2 | undefined = undefined;
    expect(binding).toBeUndefined();
  });
});

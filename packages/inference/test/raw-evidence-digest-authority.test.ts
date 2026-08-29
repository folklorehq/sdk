// SPDX-License-Identifier: Apache-2.0
import type { AciDstackRawEvidenceV1 } from '@folklore/contracts';
import { describe, expect, it } from 'vitest';
import { RawEvidenceDigestAuthority } from './doubles/aci/RawEvidenceDigestAuthority.js';

describe('RawEvidenceDigestAuthority', () => {
  it('matches the canonical V2 raw evidence golden digest', () => {
    const evidence: AciDstackRawEvidenceV1 = {
      version: 1,
      format: 'dstack-native-evidence',
      quote_base64: Buffer.from('quote').toString('base64'),
      collateral_base64: Buffer.from('collateral').toString('base64'),
      event_log_base64: Buffer.from('event-log').toString('base64'),
      vm_config_base64: Buffer.from('vm-config').toString('base64'),
      session_id: 'session-1',
      workload_keyset_digest: `sha256:${'a'.repeat(64)}`,
    };

    expect(new RawEvidenceDigestAuthority().digest(evidence)).toBe(
      'sha256:cbc1e5fb83e762363a9d51283dda0581fd8e346a14808eee260f90b6ecd60117',
    );
  });
});

// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { aciDstackRawEvidenceV1Schema, type AciDstackRawEvidenceV1 } from '@folklore/contracts';
import type { AciRawEvidenceDigestAuthorityPort } from '../../../src/ports.js';

const DSTACK_RAW_EVIDENCE_V2_DOMAIN = 'folklore.dstack-raw-evidence.v2';

type CanonicalValue = number | string;

export class RawEvidenceDigestAuthority implements AciRawEvidenceDigestAuthorityPort {
  digest(evidence: AciDstackRawEvidenceV1): string {
    evidence = aciDstackRawEvidenceV1Schema.parse(evidence);
    const quoteDigest = this.sha256(Buffer.from(evidence.quote_base64, 'base64'));
    const collateralDigest = this.sha256(Buffer.from(evidence.collateral_base64, 'base64'));
    const eventLogDigest = this.sha256(Buffer.from(evidence.event_log_base64, 'base64'));
    const vmConfigDigest = this.sha256(Buffer.from(evidence.vm_config_base64, 'base64'));
    const payload = this.encodeArray([
      evidence.version,
      evidence.format,
      evidence.session_id,
      evidence.workload_keyset_digest,
      quoteDigest,
      collateralDigest,
      eventLogDigest,
      vmConfigDigest,
    ]);
    return `sha256:${this.sha256(
      Buffer.concat([
        Buffer.from(DSTACK_RAW_EVIDENCE_V2_DOMAIN, 'utf8'),
        Buffer.from([0]),
        payload,
      ]),
    )}`;
  }

  private encodeArray(values: readonly CanonicalValue[]): Buffer {
    return Buffer.concat([
      this.encodeLength(4, values.length),
      ...values.map((value) =>
        typeof value === 'number'
          ? this.encodeLength(0, value)
          : Buffer.concat([
              this.encodeLength(3, Buffer.byteLength(value, 'utf8')),
              Buffer.from(value, 'utf8'),
            ]),
      ),
    ]);
  }

  private encodeLength(majorType: number, value: number): Buffer {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('invalid canonical value');
    const prefix = majorType << 5;
    if (value < 24) return Buffer.from([prefix | value]);
    if (value <= 0xff) return Buffer.from([prefix | 24, value]);
    if (value <= 0xffff) {
      const encoded = Buffer.allocUnsafe(3);
      encoded[0] = prefix | 25;
      encoded.writeUInt16BE(value, 1);
      return encoded;
    }
    if (value <= 0xffffffff) {
      const encoded = Buffer.allocUnsafe(5);
      encoded[0] = prefix | 26;
      encoded.writeUInt32BE(value, 1);
      return encoded;
    }
    throw new TypeError('invalid canonical value');
  }

  private sha256(value: Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
  }
}

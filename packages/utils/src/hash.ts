// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

/** SHA-256 hex digest of a string or buffer. */
export function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Deterministic, RFC-4122-shaped UUID derived from a namespace + key via SHA-256; same input → same UUID. */
export function deterministicUuid(namespace: string, key: string): string {
  const h = sha256Hex(`${namespace}:${key}`);
  const version = `5${h.slice(13, 16)}`; // 8-4-[4]-4-12, version nibble = 5
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return [h.slice(0, 8), h.slice(8, 12), version, variant + h.slice(18, 20), h.slice(20, 32)].join(
    '-',
  );
}

/** The canonical `sources`-row id for one (org, kind); the enclave-output writer and OAuth-connect signal must derive it identically. */
export function deriveSourceId(orgId: string, kind: string): string {
  const h = sha256Hex(`${orgId}/${kind}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

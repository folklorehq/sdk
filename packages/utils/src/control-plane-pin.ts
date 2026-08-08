// SPDX-License-Identifier: Apache-2.0
import { createHash, timingSafeEqual } from 'node:crypto';
import { checkServerIdentity } from 'node:tls';

/** Hostname verification plus an SPKI-SHA256 pin, for any client calling the control plane. */
export function verifyControlPlaneCertificate(
  hostname: string,
  certificate: Parameters<typeof checkServerIdentity>[1],
  expectedPins: readonly string[],
): Error | undefined {
  const tlsError = checkServerIdentity(hostname, certificate);
  if (tlsError) return tlsError;
  if (!certificate.pubkey) return new Error('control_plane_spki_unavailable');
  const actualPin = createHash('sha256').update(certificate.pubkey).digest('hex');
  return matchesSpkiPin(expectedPins, actualPin)
    ? undefined
    : new Error('control_plane_spki_pin_mismatch');
}

export function matchesSpkiPin(expectedPins: readonly string[], actualPin: string): boolean {
  const actual = Buffer.from(actualPin, 'hex');
  return expectedPins.some((expectedPin) => {
    const expected = Buffer.from(expectedPin, 'hex');
    return expected.byteLength === actual.byteLength && timingSafeEqual(expected, actual);
  });
}

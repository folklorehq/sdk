// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { digest64Schema, type Digest64 } from '@folklore/contracts';

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

export const sha256DigestV1Schema = z
  .string()
  .regex(SHA256_DIGEST_PATTERN, 'digest must be sha256: followed by 64 lowercase hex characters')
  .brand<'Sha256DigestV1'>();
export type Sha256DigestV1 = z.infer<typeof sha256DigestV1Schema>;

export function parseSha256DigestV1(value: string): Sha256DigestV1 {
  return sha256DigestV1Schema.parse(value);
}

export function mintSha256DigestV1(bytes: Uint8Array): Sha256DigestV1 {
  return parseSha256DigestV1(`sha256:${createHash('sha256').update(bytes).digest('hex')}`);
}

export function sha256DigestV1FromDigest64(value: Digest64): Sha256DigestV1 {
  return parseSha256DigestV1(`sha256:${digest64Schema.parse(value)}`);
}

export function digest64FromSha256DigestV1(value: Sha256DigestV1): Digest64 {
  const parsed = parseSha256DigestV1(value);
  return digest64Schema.parse(parsed.slice('sha256:'.length));
}

export const fixedWidthSequenceV1Schema = z
  .string()
  .regex(/^\d{16}$/)
  .brand<'FixedWidthSequenceV1'>();
export type FixedWidthSequenceV1 = z.infer<typeof fixedWidthSequenceV1Schema>;

export const s3ObjectVersionIdV1Schema = z.string().min(1).brand<'S3ObjectVersionIdV1'>();
export type S3ObjectVersionIdV1 = z.infer<typeof s3ObjectVersionIdV1Schema>;

export const evidenceVersionTokenV1Schema = z.string().min(1).brand<'EvidenceVersionTokenV1'>();
export type EvidenceVersionTokenV1 = z.infer<typeof evidenceVersionTokenV1Schema>;

export interface VersionedContentFreeRecordV1<T> {
  readonly record: T;
  readonly objectVersionId: S3ObjectVersionIdV1;
  readonly versionToken: EvidenceVersionTokenV1;
  readonly objectDigest: Sha256DigestV1;
  readonly objectByteLength: number;
}

export const forwardAuthorityTokenV1Schema =
  sha256DigestV1Schema.brand<'ForwardAuthorityTokenV1'>();
export type ForwardAuthorityTokenV1 = z.infer<typeof forwardAuthorityTokenV1Schema>;

export const forwardLeaseBindingDigestV1Schema =
  sha256DigestV1Schema.brand<'ForwardLeaseBindingDigestV1'>();
export type ForwardLeaseBindingDigestV1 = z.infer<typeof forwardLeaseBindingDigestV1Schema>;

export const monotonicRawNanosecondsV1Schema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .brand<'MonotonicRawNanosecondsV1'>();
export type MonotonicRawNanosecondsV1 = z.infer<typeof monotonicRawNanosecondsV1Schema>;

export function parseForwardAuthorityTokenV1(value: string): ForwardAuthorityTokenV1 {
  return forwardAuthorityTokenV1Schema.parse(value);
}

export function parseForwardLeaseBindingDigestV1(value: string): ForwardLeaseBindingDigestV1 {
  return forwardLeaseBindingDigestV1Schema.parse(value);
}

export function monotonicRawNanosecondsV1FromBigInt(value: bigint): MonotonicRawNanosecondsV1 {
  if (value < 0n) throw new Error('monotonic nanoseconds must not be negative');
  return monotonicRawNanosecondsV1Schema.parse(value.toString());
}

export function bigintFromMonotonicRawNanosecondsV1(value: MonotonicRawNanosecondsV1): bigint {
  return BigInt(monotonicRawNanosecondsV1Schema.parse(value));
}

// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MEASUREMENT_PATTERN = /^[0-9a-f]{96}$/;
const ED25519_SIGNATURE_PATTERN = /^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeCanonicalBase64(value: string): Uint8Array {
  if (!BASE64_PATTERN.test(value)) throw new TypeError('bytes must be canonical base64');
  const paddingLength = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const output = new Uint8Array((value.length / 4) * 3 - paddingLength);
  let outputIndex = 0;
  for (let index = 0; index < value.length; index += 4) {
    const first = BASE64_ALPHABET.indexOf(value[index] ?? '');
    const second = BASE64_ALPHABET.indexOf(value[index + 1] ?? '');
    const thirdCharacter = value[index + 2] ?? '=';
    const fourthCharacter = value[index + 3] ?? '=';
    const third = thirdCharacter === '=' ? 0 : BASE64_ALPHABET.indexOf(thirdCharacter);
    const fourth = fourthCharacter === '=' ? 0 : BASE64_ALPHABET.indexOf(fourthCharacter);
    if (first < 0 || second < 0 || third < 0 || fourth < 0) {
      throw new TypeError('bytes must be canonical base64');
    }
    if (thirdCharacter === '=' && (second & 0x0f) !== 0) {
      throw new TypeError('bytes must be canonical base64');
    }
    if (fourthCharacter === '=' && thirdCharacter !== '=' && (third & 0x03) !== 0) {
      throw new TypeError('bytes must be canonical base64');
    }
    if (outputIndex < output.length) output[outputIndex++] = (first << 2) | (second >> 4);
    if (outputIndex < output.length) output[outputIndex++] = ((second & 0x0f) << 4) | (third >> 2);
    if (outputIndex < output.length) output[outputIndex++] = ((third & 0x03) << 6) | fourth;
  }
  return output;
}

function encodeBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index] ?? 0;
    const second = bytes[index + 1];
    const third = bytes[index + 2];
    result += BASE64_ALPHABET[first >> 2];
    result += BASE64_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    result +=
      second === undefined ? '=' : BASE64_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    result += third === undefined ? '=' : BASE64_ALPHABET[third & 0x3f];
  }
  return result;
}

export const identifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(IDENTIFIER_PATTERN, 'identifier must be canonical');
export const digest64Schema = z
  .string()
  .regex(HEX_DIGEST_PATTERN, 'digest must be 64 lowercase hex characters');
export const gitCommitSchema = z
  .string()
  .regex(GIT_COMMIT_PATTERN, 'git commit must be 40 lowercase hex characters');
export const measurement96Schema = z
  .string()
  .regex(MEASUREMENT_PATTERN, 'measurement must be 96 lowercase hex characters');
export const base64Ed25519SignatureSchema = z
  .string()
  .regex(ED25519_SIGNATURE_PATTERN, 'signature must be canonical base64 Ed25519 bytes')
  .refine((value) => {
    try {
      return decodeCanonicalBase64(value).length === 64;
    } catch {
      return false;
    }
  }, 'signature must decode to 64 bytes')
  .refine((value) => {
    try {
      return encodeBase64(decodeCanonicalBase64(value)) === value;
    } catch {
      return false;
    }
  }, 'signature must be canonical base64 Ed25519 bytes');

// Ed25519 SubjectPublicKeyInfo DER is a fixed 12-byte ASN.1 prefix plus the 32-byte public key.
export const ed25519SpkiSchema = z
  .string()
  .length(60)
  .regex(/^MCowBQYDK2VwAyEA[A-Za-z0-9+/]{43}=$/)
  .refine((value) => {
    try {
      return encodeBase64(decodeCanonicalBase64(value)) === value;
    } catch {
      return false;
    }
  }, 'SPKI must be canonical base64');

export const opaqueS3VersionIdSchema = z
  .string()
  .min(1)
  .max(1_024)
  .regex(/^[\x21-\x7e]+$/, 'S3 VersionId must be an opaque visible-ASCII token');

export function canonicalBase64BytesSchema(input: {
  readonly maxDecodedBytes: number;
}): z.ZodType<string> {
  return z
    .string()
    .min(1)
    .regex(BASE64_PATTERN, 'bytes must be canonical base64')
    .refine((value) => {
      try {
        return decodeCanonicalBase64(value).length <= input.maxDecodedBytes;
      } catch {
        return false;
      }
    })
    .refine((value) => {
      try {
        return encodeBase64(decodeCanonicalBase64(value)) === value;
      } catch {
        return false;
      }
    }, 'bytes must be canonical base64');
}

export type Digest64 = z.infer<typeof digest64Schema>;
export type GitCommit = z.infer<typeof gitCommitSchema>;
export type Measurement96 = z.infer<typeof measurement96Schema>;
export type Base64Ed25519Signature = z.infer<typeof base64Ed25519SignatureSchema>;

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON requires finite numbers');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('canonical JSON requires JSON values');
}

// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/;
const HEX_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const GIT_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MEASUREMENT_PATTERN = /^[0-9a-f]{96}$/;
const ED25519_SIGNATURE_PATTERN = /^(?:[A-Za-z0-9+/]{4}){21}[A-Za-z0-9+/]{2}==$/;

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
  .regex(ED25519_SIGNATURE_PATTERN, 'signature must be canonical base64 Ed25519 bytes');

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

// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { isLowercaseRfcUuid } from './uuid.js';

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
  return uuidShapedSha256(`${orgId}/${kind}`);
}

export type KeyedSourceFactId = string & { readonly __brand: 'KeyedSourceFactId' };

const KEYED_SOURCE_FACT_ID_PATTERN = /^[0-9a-f]{64}$/;

export function isKeyedSourceFactId(value: string): value is KeyedSourceFactId {
  return KEYED_SOURCE_FACT_ID_PATTERN.test(value);
}

export const MEMBER_FACT_ID_NAMESPACE = 'member-fact';
const MEMBER_SOURCE_ID_NAMESPACE = 'member-source';
const MEMBER_FIELD_SEPARATOR = '\0';
const SOURCE_KIND_PATTERN = /^[a-z0-9_]+$/;

/** The `sources`-row id for one member's personal source; never equal to an org source id. */
export function deriveMemberSourceId(orgId: string, kind: string, ownerAccountId: string): string {
  assertMemberScope('deriveMemberSourceId', orgId, kind, ownerAccountId);
  // A slash-free namespace and NUL-joined fields keep this preimage disjoint from deriveSourceId's `org/kind`.
  return deterministicUuid(
    MEMBER_SOURCE_ID_NAMESPACE,
    [orgId, kind, ownerAccountId].join(MEMBER_FIELD_SEPARATOR),
  );
}

// UNWIRED: no production caller yet.
/** Fact-id key for a member pull; hash it under MEMBER_FACT_ID_NAMESPACE, never the org 'fact' namespace. */
export function memberFactKey(
  orgId: string,
  kind: string,
  ownerAccountId: string,
  keyedSourceFactId: KeyedSourceFactId,
): string {
  assertMemberScope('memberFactKey', orgId, kind, ownerAccountId);
  return `${orgId}:${kind}:member:${ownerAccountId}:${keyedSourceFactId}`;
}

function assertMemberScope(
  caller: string,
  orgId: string,
  kind: string,
  ownerAccountId: string,
): void {
  if (!isLowercaseRfcUuid(orgId)) {
    throw new Error(`${caller}: orgId must be a lowercase RFC 9562 UUID`);
  }
  if (!SOURCE_KIND_PATTERN.test(kind)) {
    throw new Error(`${caller}: kind must match ${SOURCE_KIND_PATTERN.source}`);
  }
  if (!isLowercaseRfcUuid(ownerAccountId)) {
    throw new Error(`${caller}: ownerAccountId must be a lowercase RFC 9562 UUID`);
  }
}

function uuidShapedSha256(input: string): string {
  const h = sha256Hex(input);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

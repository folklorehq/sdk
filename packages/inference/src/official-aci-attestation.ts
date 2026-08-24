// SPDX-License-Identifier: Apache-2.0
import { aciWorkloadReportSchema, type AciWorkloadReport } from '@folklore/contracts';

const LEGACY_MARKERS = [
  'workload_id',
  'channel_key_digest',
  'quote_root_digest',
  'workload_measurement',
  'receipt_keyset_digest',
  'policy_generation',
  'route',
  'signer_key_id',
  'signature',
] as const;
export interface LegacyAciAttestation {
  readonly workload_id: string;
  readonly workload_keyset_digest: string;
  readonly channel_key_digest: string;
  readonly quote_root_digest: string;
  readonly workload_measurement: string;
  readonly receipt_keyset_digest: string;
  readonly policy_generation: number;
  readonly route: string;
  readonly signer_key_id: string;
  readonly signature: string;
}

export interface OfficialAciAttestationSummary {
  readonly apiVersion: 'aci/1';
  readonly workloadKeysetDigest: string;
  readonly teeType: string;
  readonly keysetExpiresAt: number;
  readonly sourceRevision: string | null;
  readonly imageDigest: string | null;
}

export type OfficialAciProtocolErrorCode =
  | 'protocol_discriminator_absent'
  | 'protocol_discriminator_non_string'
  | 'protocol_discriminator_unknown'
  | 'protocol_discriminator_conflicting'
  | 'official_aci_1_invalid';

export type AciProtocolDispatch =
  | { readonly protocol: 'official-aci/1'; readonly report: AciWorkloadReport }
  | { readonly protocol: 'legacy-v1'; readonly body: LegacyAciAttestation }
  | { readonly protocol: 'error'; readonly code: OfficialAciProtocolErrorCode };

export type LegacyAciParser = (raw: unknown) => LegacyAciAttestation;

export function parseOfficialAciReport(raw: unknown): AciWorkloadReport {
  return aciWorkloadReportSchema.parse(raw);
}

export function summarizeOfficialAciReport(raw: unknown): OfficialAciAttestationSummary {
  const report = parseOfficialAciReport(raw);
  const sourceProvenance = report.attestation.source_provenance;
  return {
    apiVersion: report.api_version,
    workloadKeysetDigest: report.workload_keyset_digest,
    teeType: report.attestation.tee_type,
    keysetExpiresAt: report.attestation.workload_keyset.not_after,
    sourceRevision: sourceProvenance?.repo_commit ?? null,
    imageDigest: sourceProvenance?.image_digest ?? null,
  };
}

export function dispatchAciProtocol(
  raw: unknown,
  legacyParser: LegacyAciParser,
): AciProtocolDispatch {
  if (!isRecord(raw)) return { protocol: 'error', code: 'protocol_discriminator_absent' };

  const hasLegacyMarker = hasAnyKey(raw, LEGACY_MARKERS);
  const hasOfficialNestedMarker = hasAnyKey(raw, ['attestation', 'service_capabilities']);
  const hasOfficialKeysetMarker =
    typeof raw.workload_keyset_digest === 'string' &&
    raw.workload_keyset_digest.startsWith('sha256:');
  const hasOfficialMarker = hasOfficialNestedMarker || hasOfficialKeysetMarker;
  const hasConflictingProtocolMarker = 'protocol' in raw && raw.protocol !== 'official-aci/1';
  const hasApiVersion = 'api_version' in raw;
  const apiVersion = raw.api_version;

  if (!hasApiVersion) {
    if (hasOfficialMarker && hasLegacyMarker) {
      return { protocol: 'error', code: 'protocol_discriminator_conflicting' };
    }
    if (hasOfficialMarker) return { protocol: 'error', code: 'protocol_discriminator_absent' };
    return { protocol: 'legacy-v1', body: legacyParser(raw) };
  }

  if (typeof apiVersion !== 'string') {
    return { protocol: 'error', code: 'protocol_discriminator_non_string' };
  }
  if (apiVersion !== 'aci/1') {
    return { protocol: 'error', code: 'protocol_discriminator_unknown' };
  }
  if (hasLegacyMarker || hasConflictingProtocolMarker) {
    return { protocol: 'error', code: 'protocol_discriminator_conflicting' };
  }

  try {
    return { protocol: 'official-aci/1', report: parseOfficialAciReport(raw) };
  } catch {
    return { protocol: 'error', code: 'official_aci_1_invalid' };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasAnyKey(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.some((key) => key in value);
}

// SPDX-License-Identifier: Apache-2.0
export type AciVerificationErrorCode =
  | 'channel_binding_missing'
  | 'channel_key_digest_mismatch'
  | 'clock_invalid'
  | 'endorsement_invalid'
  | 'evidence_verifier_required'
  | 'fetch_timeout_invalid'
  | 'freshness_exceeds_keyset'
  | 'keyset_expired'
  | 'keyset_lifetime_exceeded'
  | 'keyset_lifetime_invalid'
  | 'native_binding_mismatch'
  | 'native_policy_mismatch'
  | 'native_result_malformed'
  | 'native_verification_failed'
  | 'native_verifier_timeout'
  | 'native_verifier_timeout_invalid'
  | 'nonce_must_be_32_bytes'
  | 'origin_mismatch'
  | 'pinned_transport_required'
  | 'policy_invalid'
  | 'report_data_mismatch'
  | 'report_expired'
  | 'report_fetch_failed'
  | 'report_from_future'
  | 'report_malformed'
  | 'report_size_invalid'
  | 'report_timeout'
  | 'report_too_large'
  | 'source_provenance_mismatch'
  | 'workload_id_mismatch'
  | 'workload_keyset_digest_mismatch';

export class AciVerificationError extends Error {
  readonly code: AciVerificationErrorCode;

  constructor(code: AciVerificationErrorCode) {
    super(`ACI verification failed: ${code}`);
    this.name = 'AciVerificationError';
    this.code = code;
  }
}

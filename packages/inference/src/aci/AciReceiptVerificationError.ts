// SPDX-License-Identifier: Apache-2.0
export type AciReceiptVerificationErrorCode =
  | 'clock_invalid'
  | 'endpoint_mismatch'
  | 'keyset_mismatch'
  | 'method_mismatch'
  | 'model_mismatch'
  | 'policy_invalid'
  | 'replay_capacity_exhausted'
  | 'receipt_fetch_failed'
  | 'event_order_invalid'
  | 'receipt_id_invalid'
  | 'receipt_id_mismatch'
  | 'receipt_id_missing'
  | 'receipt_malformed'
  | 'receipt_replay'
  | 'receipt_timeout'
  | 'receipt_too_large'
  | 'request_hash_mismatch'
  | 'response_hash_mismatch'
  | 'served_at_invalid'
  | 'signature_algorithm_mismatch'
  | 'signature_invalid'
  | 'signer_not_found'
  | 'snapshot_invalid'
  | 'upstream_session_mismatch'
  | 'workload_mismatch';

export class AciReceiptVerificationError extends Error {
  readonly code: AciReceiptVerificationErrorCode;

  constructor(code: AciReceiptVerificationErrorCode) {
    super(`ACI receipt verification failed: ${code}`);
    this.name = 'AciReceiptVerificationError';
    this.code = code;
  }
}

// SPDX-License-Identifier: Apache-2.0
export type AciSessionVerificationErrorCode =
  | 'activation_generation_decreased'
  | 'channel_binding_mismatch'
  | 'clock_invalid'
  | 'evidence_digest_mismatch'
  | 'input_invalid'
  | 'keyset_expired'
  | 'keyset_superseded'
  | 'keyset_version_decreased'
  | 'mixed_state'
  | 'no_eligible_session'
  | 'policy_invalid'
  | 'policy_generation_decreased'
  | 'role_incomplete'
  | 'session_evidence_binding_mismatch'
  | 'session_evidence_missing'
  | 'session_evidence_verification_failed'
  | 'evidence_verifier_unavailable'
  | 'session_malformed'
  | 'session_id_mismatch';

export class AciSessionVerificationError extends Error {
  readonly code: AciSessionVerificationErrorCode;

  constructor(code: AciSessionVerificationErrorCode) {
    super(`ACI session verification failed: ${code}`);
    this.name = 'AciSessionVerificationError';
    this.code = code;
  }
}

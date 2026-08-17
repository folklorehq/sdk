// SPDX-License-Identifier: Apache-2.0
export type OfficialAciExchangeErrorCode =
  | 'admission_required'
  | 'clock_invalid'
  | 'channel_binding_mismatch'
  | 'channel_open_failed'
  | 'channel_transport_required'
  | 'decode_failed'
  | 'endpoint_mismatch'
  | 'inference_fetch_failed'
  | 'inference_refused'
  | 'inference_timeout'
  | 'lease_required'
  | 'lease_invalid'
  | 'model_mismatch'
  | 'policy_invalid'
  | 'receipt_id_missing'
  | 'receipt_verification_failed'
  | 'request_malformed'
  | 'request_too_large'
  | 'response_too_large'
  | 'streaming_unsupported'
  | 'trust_expired'
  | 'trust_mismatch'
  | 'trust_unavailable'
  | 'test_only_path_unavailable';

export class OfficialAciExchangeError extends Error {
  readonly code: OfficialAciExchangeErrorCode;

  constructor(code: OfficialAciExchangeErrorCode) {
    super(`Official ACI exchange failed: ${code}`);
    this.name = 'OfficialAciExchangeError';
    this.code = code;
  }
}

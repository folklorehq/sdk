// SPDX-License-Identifier: Apache-2.0
export type OfficialAciExchangeErrorCode =
  | 'clock_invalid'
  | 'decode_failed'
  | 'endpoint_mismatch'
  | 'inference_fetch_failed'
  | 'inference_timeout'
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
  | 'trust_unavailable';

export class OfficialAciExchangeError extends Error {
  readonly code: OfficialAciExchangeErrorCode;

  constructor(code: OfficialAciExchangeErrorCode) {
    super(`Official ACI exchange failed: ${code}`);
    this.name = 'OfficialAciExchangeError';
    this.code = code;
  }
}

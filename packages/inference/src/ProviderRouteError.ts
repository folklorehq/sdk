// SPDX-License-Identifier: Apache-2.0
import { ProviderHttpError } from './ProviderHttpError.js';

const NOT_AN_HTTP_STATUS = 0;

export type ProviderDeferralClass = 'outage' | 'slow';

export interface ProviderRouteErrorInit {
  readonly provider: string;
  readonly code: string;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly deferral?: ProviderDeferralClass;
  readonly marksSlow?: boolean;
  readonly fallbackEligible?: boolean;
}

/** A provider route refusal: the message is the code; no upstream text or cause is kept. */
export class ProviderRouteError extends ProviderHttpError {
  readonly provider: string;
  readonly code: string;
  readonly deferral: ProviderDeferralClass | undefined;
  readonly marksSlow: boolean;
  readonly fallbackEligible: boolean;

  constructor(init: ProviderRouteErrorInit) {
    super(init.code, init.status ?? NOT_AN_HTTP_STATUS, init.retryAfterMs);
    this.name = 'ProviderRouteError';
    this.provider = init.provider;
    this.code = init.code;
    this.deferral = init.deferral;
    this.marksSlow = init.marksSlow ?? false;
    this.fallbackEligible = init.fallbackEligible ?? false;
  }
}

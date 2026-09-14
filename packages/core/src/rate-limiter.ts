// SPDX-License-Identifier: Apache-2.0
export interface RateLimitRequest {
  scope: string;
  orgId: string;
  subjectId: string;
  burst: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(request: RateLimitRequest): Promise<RateLimitDecision>;
}

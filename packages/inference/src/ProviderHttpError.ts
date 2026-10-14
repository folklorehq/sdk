// SPDX-License-Identifier: Apache-2.0
import { parseRetryAfterMs } from '@folklore/utils';

// Bounds how long a single provider reply can make a caller wait.
export const MAX_RETRY_AFTER_MS = 60_000;
const RETRY_AFTER_HEADER = 'retry-after';

/** A non-2xx provider reply: its status and requested wait only, never its body. */
export class ProviderHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | undefined;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'ProviderHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }

  static fromResponse(
    message: string,
    res: Pick<Response, 'status' | 'headers'>,
  ): ProviderHttpError {
    const retryAfterMs = parseRetryAfterMs(
      res.headers.get(RETRY_AFTER_HEADER),
      Date.now(),
      MAX_RETRY_AFTER_MS,
    );
    return new ProviderHttpError(message, res.status, retryAfterMs);
  }
}

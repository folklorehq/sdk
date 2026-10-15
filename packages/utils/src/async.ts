// SPDX-License-Identifier: Apache-2.0
/** Resolves after `ms` — used to pace sequential external calls under a rate limit. */
export async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/** Race `promise` against a timer — rejects after `ms` if the promise hasn't settled. */
export async function timeLimited<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

const REQUEST_TIMEOUT_ERROR = 'TimeoutError';

/** Aborts `controller` with a `TimeoutError` after `ms`; the caller clears the returned timer. */
export function abortAfter(controller: AbortController, ms: number): ReturnType<typeof setTimeout> {
  return setTimeout(
    () => controller.abort(new DOMException('request timed out', REQUEST_TIMEOUT_ERROR)),
    ms,
  );
}

/** Map `items` through `fn` with at most `limit` in flight, preserving input order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let i = next++; i < items.length; i = next++) {
      results[i] = await fn(items[i]!, i);
    }
  };
  const size = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: size }, () => worker()));
  return results;
}

/** The lowest-index rejection `isSecondary` does not accept; when every rejection is secondary, the lowest one. */
export function primaryRejection(
  results: readonly PromiseSettledResult<unknown>[],
  isSecondary: (reason: unknown) => boolean = () => false,
): PromiseRejectedResult | undefined {
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  return rejected.find((result) => !isSecondary(result.reason)) ?? rejected[0];
}

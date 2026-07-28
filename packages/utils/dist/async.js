// SPDX-License-Identifier: Apache-2.0
/** Race `promise` against a timer — rejects after `ms` if the promise hasn't settled. */
export async function timeLimited(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    }
    finally {
        clearTimeout(timer);
    }
}
/** Map `items` through `fn` with at most `limit` in flight, preserving input order. */
export async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        for (let i = next++; i < items.length; i = next++) {
            results[i] = await fn(items[i], i);
        }
    };
    const size = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: size }, () => worker()));
    return results;
}
//# sourceMappingURL=async.js.map
/** Race `promise` against a timer — rejects after `ms` if the promise hasn't settled. */
export declare function timeLimited<T>(promise: Promise<T>, ms: number): Promise<T>;
/** Map `items` through `fn` with at most `limit` in flight, preserving input order. */
export declare function mapWithConcurrency<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;
//# sourceMappingURL=async.d.ts.map
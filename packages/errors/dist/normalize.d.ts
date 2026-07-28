import { AppError } from './app-error.js';
/** Type guard: is this one of our structured application errors? */
export declare function isAppError(value: unknown): value is AppError;
/** Coerce any thrown value into an `AppError`, wrapping non-`AppError`s in `InternalError` with the original as `cause`. */
export declare function normalizeError(value: unknown, options?: {
    component?: string;
}): AppError;
//# sourceMappingURL=normalize.d.ts.map
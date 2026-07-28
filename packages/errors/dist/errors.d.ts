import { AppError, type AppErrorOptions } from './AppError.js';
/** Input failed validation (bad request shape, invalid field). */
export declare class ValidationError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
/** A requested resource does not exist. */
export declare class NotFoundError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
/** The caller is authenticated but not allowed to do this (access check). */
export declare class ForbiddenError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
/** The operation conflicts with current state (e.g. unique violation). */
export declare class ConflictError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
/** A rate limit (ours or an upstream source's) was hit. */
export declare class RateLimitError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
/** An upstream source/integration call failed (Slack, GitHub, ...). */
export declare class ExternalServiceError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
/** A capability is not wired in this deployment (503); `code` names the specific reason. */
export declare class ServiceUnavailableError extends AppError {
    constructor(message: string, code: string, options?: AppErrorOptions);
}
/** Narrows an optional dependency, throwing `ServiceUnavailableError` instead of leaving each call site to reimplement the absent-service guard. */
export declare function requireService<T>(service: T | undefined, code: string, message: string): T;
/** A ciphertext decrypted, but its bound encryption context (AAD) didn't match what the caller expected — an integrity event (relocated/misrouted ciphertext), not a transient decrypt failure. */
export declare class EncryptionContextMismatchError extends AppError {
    constructor(mismatchedKeys: readonly string[], options?: AppErrorOptions);
}
/** Deployment/environment is misconfigured — a bug, not a handled condition. */
export declare class ConfigurationError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
/** Unexpected internal failure — the default for anything unclassified. */
export declare class InternalError extends AppError {
    constructor(message: string, options?: AppErrorOptions);
}
//# sourceMappingURL=errors.d.ts.map
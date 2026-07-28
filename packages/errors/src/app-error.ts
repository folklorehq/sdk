// SPDX-License-Identifier: Apache-2.0
/** Broad failure classes, each with a sensible default HTTP status. */
export type ErrorCategory =
  | 'validation'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'rate_limit'
  | 'external'
  | 'unavailable'
  | 'internal';

const DEFAULT_STATUS: Record<ErrorCategory, number> = {
  validation: 400,
  not_found: 404,
  forbidden: 403,
  conflict: 409,
  rate_limit: 429,
  external: 502,
  unavailable: 503,
  internal: 500,
};

export interface AppErrorOptions {
  /** The underlying error/value that triggered this one. */
  cause?: unknown;
  /** Local-only structured detail for logging/debugging — NEVER sent to the control plane. */
  context?: Record<string, unknown>;
  /** Subsystem this error is attributed to, for fleet telemetry (ADL #18). */
  component?: string;
  /** Expected/handled failure (true) vs. a bug or unknown state (false). */
  isOperational?: boolean;
  /** Override the category's default HTTP status. */
  httpStatus?: number;
}

interface AppErrorParams extends AppErrorOptions {
  code: string;
  category: ErrorCategory;
}

/** Content-free shape that may be reported to the control plane (ADL #18). */
export interface ErrorTelemetry {
  error_type: string;
  component: string;
}

/** Base class for all application errors — only `toTelemetry()` is safe to send outward. */
export abstract class AppError extends Error {
  /** Stable machine-readable code; doubles as the telemetry `error_type`. */
  readonly code: string;
  readonly category: ErrorCategory;
  readonly httpStatus: number;
  readonly context?: Readonly<Record<string, unknown>>;
  readonly component?: string;
  readonly isOperational: boolean;

  protected constructor(message: string, params: AppErrorParams) {
    super(message, params.cause !== undefined ? { cause: params.cause } : undefined);
    // Pass code/category via super (not class fields) so they're set before the
    // base constructor reads them — class-field initializers run after super().
    this.name = new.target.name;
    this.code = params.code;
    this.category = params.category;
    this.httpStatus = params.httpStatus ?? DEFAULT_STATUS[params.category];
    this.context = params.context;
    this.component = params.component;
    this.isOperational = params.isOperational ?? true;
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, new.target);
    }
  }

  /** Content-free classification for the control-plane check-in (ADL #18). */
  toTelemetry(): ErrorTelemetry {
    return { error_type: this.code, component: this.component ?? 'unknown' };
  }

  /** Structured fields for local logging. Stays inside the box. */
  toLogContext(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      httpStatus: this.httpStatus,
      isOperational: this.isOperational,
      ...(this.component ? { component: this.component } : {}),
      ...(this.context ? { context: this.context } : {}),
    };
  }
}

const DEFAULT_STATUS = {
    validation: 400,
    not_found: 404,
    forbidden: 403,
    conflict: 409,
    rate_limit: 429,
    external: 502,
    unavailable: 503,
    internal: 500,
};
/** Base class for all application errors — only `toTelemetry()` is safe to send outward. */
export class AppError extends Error {
    /** Stable machine-readable code; doubles as the telemetry `error_type`. */
    code;
    category;
    httpStatus;
    context;
    component;
    isOperational;
    constructor(message, params) {
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
    toTelemetry() {
        return { error_type: this.code, component: this.component ?? 'unknown' };
    }
    /** Structured fields for local logging. Stays inside the box. */
    toLogContext() {
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
//# sourceMappingURL=app-error.js.map
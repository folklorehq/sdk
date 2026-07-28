export type ErrorOrigin = 'http' | 'uncaught' | 'unhandled_rejection' | 'manual';
/** Content-free error record for fleet analytics (ADL #18) — never message/stack text. */
export interface ErrorReport {
    error_type: string;
    error_name: string;
    category: string;
    http_status: number;
    operational: boolean;
    component: string;
    origin: ErrorOrigin;
    fingerprint: string;
    route?: string;
    source_location?: string;
}
export interface ToErrorReportOptions {
    origin: ErrorOrigin;
    component?: string;
    route?: string;
}
export declare function toErrorReport(value: unknown, opts: ToErrorReportOptions): ErrorReport;
//# sourceMappingURL=error-report.d.ts.map
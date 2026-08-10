// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { AppError, type ErrorCategory } from './AppError.js';
import {
  ConfigurationError,
  ConflictError,
  EncryptionContextMismatchError,
  ExternalServiceError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitError,
  ServiceUnavailableError,
  ValidationError,
} from './errors.js';
import { normalizeError } from './normalize.js';

export type ErrorOrigin = 'http' | 'uncaught' | 'unhandled_rejection' | 'manual';

interface ErrorReportClassification {
  error_name: string;
  category: ErrorCategory;
  http_status: number;
  operational: boolean;
}

export const ERROR_REPORT_CLASSIFICATIONS = {
  validation_error: {
    error_name: 'ValidationError',
    category: 'validation',
    http_status: 400,
    operational: true,
  },
  not_found: {
    error_name: 'NotFoundError',
    category: 'not_found',
    http_status: 404,
    operational: true,
  },
  forbidden: {
    error_name: 'ForbiddenError',
    category: 'forbidden',
    http_status: 403,
    operational: true,
  },
  conflict: {
    error_name: 'ConflictError',
    category: 'conflict',
    http_status: 409,
    operational: true,
  },
  rate_limit: {
    error_name: 'RateLimitError',
    category: 'rate_limit',
    http_status: 429,
    operational: true,
  },
  external_service_error: {
    error_name: 'ExternalServiceError',
    category: 'external',
    http_status: 502,
    operational: true,
  },
  service_unavailable: {
    error_name: 'ServiceUnavailableError',
    category: 'unavailable',
    http_status: 503,
    operational: true,
  },
  encryption_context_mismatch: {
    error_name: 'EncryptionContextMismatchError',
    category: 'internal',
    http_status: 500,
    operational: false,
  },
  configuration_error: {
    error_name: 'ConfigurationError',
    category: 'internal',
    http_status: 500,
    operational: false,
  },
  internal_error: {
    error_name: 'InternalError',
    category: 'internal',
    http_status: 500,
    operational: false,
  },
} as const satisfies Record<string, ErrorReportClassification>;

export type ErrorReportType = keyof typeof ERROR_REPORT_CLASSIFICATIONS;
export type ErrorReportName = (typeof ERROR_REPORT_CLASSIFICATIONS)[ErrorReportType]['error_name'];
export type ErrorReportComponent =
  | 'agent'
  | 'api'
  | 'control-plane-server'
  | 'http'
  | 'unknown'
  | 'worker';

/** Content-free error record for fleet analytics — never message/stack text. */
export interface ErrorReport {
  error_type: ErrorReportType;
  error_name: ErrorReportName;
  category: ErrorCategory;
  http_status: number;
  operational: boolean;
  component: ErrorReportComponent;
  origin: ErrorOrigin;
  fingerprint: string;
  route?: string;
}

export interface ToErrorReportOptions {
  origin: ErrorOrigin;
  component?: string;
  route?: string;
}

const ERROR_REPORT_COMPONENTS = new Set<ErrorReportComponent>([
  'agent',
  'api',
  'control-plane-server',
  'http',
  'unknown',
  'worker',
]);
const ERROR_REPORT_ORIGINS = new Set<ErrorOrigin>([
  'http',
  'uncaught',
  'unhandled_rejection',
  'manual',
]);
const ERROR_REPORT_FIELDS = new Set([
  'category',
  'component',
  'error_name',
  'error_type',
  'fingerprint',
  'http_status',
  'operational',
  'origin',
  'route',
]);
const ERROR_FINGERPRINT_PATTERN = /^[0-9a-f]{16}$/;
const ROUTE_TEMPLATE_PATTERN =
  /^\/(?:[a-z0-9._-]+|:[A-Za-z][A-Za-z0-9_]*)(?:\/(?:[a-z0-9._-]+|:[A-Za-z][A-Za-z0-9_]*))*$/;
const FINGERPRINT_LENGTH = 16;

export function toErrorReport(value: unknown, opts: ToErrorReportOptions): ErrorReport {
  const appError = normalizeError(
    value,
    opts.component ? { component: opts.component } : undefined,
  );
  const error_type = classificationType(appError);
  const classification = ERROR_REPORT_CLASSIFICATIONS[error_type];
  const component = normalizeComponent(opts.component ?? appError.component);
  return {
    error_type,
    ...classification,
    component,
    origin: opts.origin,
    fingerprint: fingerprint(error_type, component),
    ...(isParameterizedRouteTemplate(opts.route) ? { route: opts.route } : {}),
  };
}

export function isErrorReport(value: unknown): value is ErrorReport {
  try {
    if (!isPlainRecord(value)) return false;
    const keys = Object.keys(value);
    if (keys.some((key) => !ERROR_REPORT_FIELDS.has(key))) return false;
    if (typeof value['error_type'] !== 'string') return false;
    if (!hasClassification(value['error_type'])) return false;
    const classification = ERROR_REPORT_CLASSIFICATIONS[value['error_type']];
    const component = value['component'];
    const reportFingerprint = value['fingerprint'];
    return (
      value['error_name'] === classification.error_name &&
      value['category'] === classification.category &&
      value['http_status'] === classification.http_status &&
      value['operational'] === classification.operational &&
      typeof component === 'string' &&
      ERROR_REPORT_COMPONENTS.has(component as ErrorReportComponent) &&
      typeof value['origin'] === 'string' &&
      ERROR_REPORT_ORIGINS.has(value['origin'] as ErrorOrigin) &&
      typeof reportFingerprint === 'string' &&
      ERROR_FINGERPRINT_PATTERN.test(reportFingerprint) &&
      reportFingerprint === fingerprint(value['error_type'], component) &&
      (value['route'] === undefined || isParameterizedRouteTemplate(value['route']))
    );
  } catch {
    return false;
  }
}

export function isParameterizedRouteTemplate(value: unknown): value is string {
  if (typeof value !== 'string' || !ROUTE_TEMPLATE_PATTERN.test(value)) return false;
  return value.split('/').some((segment) => segment.startsWith(':'));
}

function classificationType(error: AppError): ErrorReportType {
  if (error instanceof ValidationError) return 'validation_error';
  if (error instanceof NotFoundError) return 'not_found';
  if (error instanceof ForbiddenError) return 'forbidden';
  if (error instanceof ConflictError) return 'conflict';
  if (error instanceof RateLimitError) return 'rate_limit';
  if (error instanceof ExternalServiceError) return 'external_service_error';
  if (error instanceof ServiceUnavailableError) return 'service_unavailable';
  if (error instanceof EncryptionContextMismatchError) return 'encryption_context_mismatch';
  if (error instanceof ConfigurationError) return 'configuration_error';
  if (error instanceof InternalError) return 'internal_error';
  return 'internal_error';
}

function hasClassification(value: string): value is ErrorReportType {
  return Object.prototype.hasOwnProperty.call(ERROR_REPORT_CLASSIFICATIONS, value);
}

function normalizeComponent(value: string | undefined): ErrorReportComponent {
  if (value && ERROR_REPORT_COMPONENTS.has(value as ErrorReportComponent)) {
    return value as ErrorReportComponent;
  }
  return 'unknown';
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fingerprint(code: string, component: string): string {
  return createHash('sha256')
    .update(`${code}|${component}`)
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

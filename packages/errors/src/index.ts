// SPDX-License-Identifier: Apache-2.0
export {
  AppError,
  type AppErrorOptions,
  type ErrorCategory,
  type ErrorTelemetry,
} from './AppError.js';
export {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
  RateLimitError,
  ExternalServiceError,
  ServiceUnavailableError,
  EncryptionContextMismatchError,
  ConfigurationError,
  InternalError,
  requireService,
} from './errors.js';
export { isAppError, normalizeError } from './normalize.js';
export {
  toErrorReport,
  type ErrorReport,
  type ErrorOrigin,
  type ToErrorReportOptions,
} from './error-report.js';

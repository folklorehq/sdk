// SPDX-License-Identifier: Apache-2.0
import { AppError, type AppErrorOptions } from './AppError.js';

/** Input failed validation (bad request shape, invalid field). */
export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'validation_error', category: 'validation' });
  }
}

/** A requested resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'not_found', category: 'not_found' });
  }
}

/** The caller is authenticated but not allowed to do this (access check). */
export class ForbiddenError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'forbidden', category: 'forbidden' });
  }
}

/** The operation conflicts with current state (e.g. unique violation). */
export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'conflict', category: 'conflict' });
  }
}

/** A rate limit (ours or an upstream source's) was hit. */
export class RateLimitError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'rate_limit', category: 'rate_limit' });
  }
}

/** An upstream source/integration call failed (Slack, GitHub, ...). */
export class ExternalServiceError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'external_service_error', category: 'external' });
  }
}

/** A capability is not wired in this deployment (503); `code` names the specific reason. */
export class ServiceUnavailableError extends AppError {
  constructor(message: string, code: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code, category: 'unavailable' });
  }
}

/** Narrows an optional dependency, throwing `ServiceUnavailableError` instead of leaving each call site to reimplement the absent-service guard. */
export function requireService<T>(service: T | undefined, code: string, message: string): T {
  if (!service) throw new ServiceUnavailableError(message, code);
  return service;
}

/** A ciphertext decrypted, but its bound encryption context (AAD) didn't match what the caller expected — an integrity event (relocated/misrouted ciphertext), not a transient decrypt failure. */
export class EncryptionContextMismatchError extends AppError {
  constructor(mismatchedKeys: readonly string[], options: AppErrorOptions = {}) {
    super(`encryption context mismatch on: ${mismatchedKeys.join(', ')}`, {
      isOperational: false,
      ...options,
      code: 'encryption_context_mismatch',
      category: 'internal',
    });
  }
}

/** Deployment/environment is misconfigured — a bug, not a handled condition. */
export class ConfigurationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, {
      isOperational: false,
      ...options,
      code: 'configuration_error',
      category: 'internal',
    });
  }
}

/** Unexpected internal failure — the default for anything unclassified. */
export class InternalError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, {
      isOperational: false,
      ...options,
      code: 'internal_error',
      category: 'internal',
    });
  }
}

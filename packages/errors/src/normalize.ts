// SPDX-License-Identifier: Apache-2.0
import { AppError } from './AppError.js';
import { InternalError } from './errors.js';

/** Type guard: is this one of our structured application errors? */
export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Coerce any thrown value into an `AppError`, wrapping non-`AppError`s in `InternalError` with the original as `cause`. */
export function normalizeError(value: unknown, options?: { component?: string }): AppError {
  if (isAppError(value)) {
    return value;
  }
  if (value instanceof Error) {
    return new InternalError(value.message, { cause: value, component: options?.component });
  }
  return new InternalError('Non-error value thrown', {
    cause: value,
    component: options?.component,
    context: { thrownType: typeof value },
  });
}

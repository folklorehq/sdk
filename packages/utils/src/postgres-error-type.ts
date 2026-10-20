// SPDX-License-Identifier: Apache-2.0
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;
// Node errno codes (EPIPE, EPERM) are five characters too, and no SQLSTATE class starts with E.
const ERRNO_CODE_PATTERN = /^E[A-Z]{4}$/;
const CONSTRAINT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const ROUTINE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const ERROR_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/;
const MAX_ERROR_TYPE_LENGTH = 64;
const MAX_CAUSE_DEPTH = 2;

interface PostgresErrorDetail {
  sqlState?: string;
  constraint?: string;
  routine?: string;
}

/** SQLSTATE plus the constraint or routine that raised it, as one `error_type` log token, or null. */
export function postgresErrorType(error: unknown): string | null {
  const detail = postgresDetail(error);
  const parts = [detail.sqlState, detail.constraint ?? detail.routine].filter(
    (part): part is string => part !== undefined,
  );
  if (parts.length === 0) return null;
  // The log value filter needs a leading letter and a SQLSTATE can start with a digit.
  const candidate = `sqlstate_${parts.join('_')}`.toLowerCase();
  // Null, never undefined: the logger rejects undefined and a rejected value drops the whole record.
  return ERROR_TYPE_PATTERN.test(candidate) && candidate.length <= MAX_ERROR_TYPE_LENGTH
    ? candidate
    : null;
}

/** The bare SQLSTATE of a driver error or its Drizzle wrapper, or null; unlike postgresErrorType it never carries the server routine. */
export function postgresSqlState(error: unknown): string | null {
  return postgresDetail(error).sqlState ?? null;
}

const RETRYABLE_SQLSTATES: ReadonlySet<string> = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
]);

/** True when the error is a serialization failure or deadlock, which a retry of the transaction can clear. */
export function isRetryablePostgresError(error: unknown): boolean {
  const { sqlState } = postgresDetail(error);
  return sqlState !== undefined && RETRYABLE_SQLSTATES.has(sqlState);
}

// Only standard codes and our own schema identifiers survive; message and detail carry values.
function postgresDetail(error: unknown, depth = 0): PostgresErrorDetail {
  if (typeof error !== 'object' || error === null) return {};
  const candidate = error as {
    code?: unknown;
    constraint_name?: unknown;
    routine?: unknown;
    cause?: unknown;
  };
  const detail: PostgresErrorDetail = {};
  if (
    typeof candidate.code === 'string' &&
    SQLSTATE_PATTERN.test(candidate.code) &&
    !ERRNO_CODE_PATTERN.test(candidate.code)
  ) {
    detail.sqlState = candidate.code;
  }
  if (
    typeof candidate.constraint_name === 'string' &&
    CONSTRAINT_NAME_PATTERN.test(candidate.constraint_name)
  ) {
    detail.constraint = candidate.constraint_name;
  }
  if (typeof candidate.routine === 'string' && ROUTINE_NAME_PATTERN.test(candidate.routine)) {
    detail.routine = candidate.routine;
  }
  // Drizzle wraps the driver error, so the SQLSTATE sits on `cause`.
  if (detail.sqlState === undefined && depth < MAX_CAUSE_DEPTH) {
    return Object.assign(postgresDetail(candidate.cause, depth + 1), detail);
  }
  return detail;
}

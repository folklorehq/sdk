// SPDX-License-Identifier: Apache-2.0
export {
  SAFE_LOG_FIELDS,
  type Logger,
  type LogContext,
  type SafeLogField,
  type SafeLogContext,
  type SafeLogEvent,
  type SafeLogValue,
  type Cache,
  type MonotonicCache,
  type Closable,
} from './ports.js';
export { ShutdownManager, type ShutdownHandler, type ShutdownOptions } from './ShutdownManager.js';
export {
  checkContentFree,
  checkDistinctId,
  checkSafeLogContext,
  checkSafeLogEvent,
  snapshotSafeLogContext,
  assertContentFree,
  ContentFreeViolationError,
  type SafeLogRejectionReason,
  type SafeLogContextSnapshot,
} from './content-free.js';

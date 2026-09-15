// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@folklore/core';
import { toErrorReport, type ErrorOrigin } from '@folklore/errors';
import type { TelemetryClient } from './ports.js';

const FLUSH_TIMEOUT_MS = 2_000;

export interface GlobalErrorReportingOptions {
  client: TelemetryClient;
  component: string;
  logger?: Logger;
  // Seam for tests; defaults to terminating the process. An uncaught fault leaves the
  // process in an undefined state, so we exit rather than let it limp on (health checks
  // could otherwise keep passing on a broken process; in Lambda it masks the failure).
  exit?: (code: number) => void;
}

/** Captures process-level crashes to PostHog (content-free) then terminates. */
export function installGlobalErrorReporting(opts: GlobalErrorReportingOptions): () => void {
  const onUncaught = (err: unknown): void => void reportFatal(opts, 'uncaught', err);
  const onRejection = (reason: unknown): void =>
    void reportFatal(opts, 'unhandled_rejection', reason);
  process.on('uncaughtException', onUncaught);
  process.on('unhandledRejection', onRejection);
  return () => {
    process.off('uncaughtException', onUncaught);
    process.off('unhandledRejection', onRejection);
  };
}

async function reportFatal(
  opts: GlobalErrorReportingOptions,
  origin: ErrorOrigin,
  err: unknown,
): Promise<void> {
  const errorReport = toErrorReport(err, { origin, component: opts.component });
  opts.client.captureError(errorReport);
  // The full report goes to telemetry; only SAFE_LOG_FIELDS survive the logging boundary. Spreading
  // the report here logged NOTHING: error_name/category/origin/fingerprint are not permitted keys,
  // so PinoLogger replaced the record with log_record_rejected (as did an invalid `component`, e.g.
  // 'control-plane-server'). That killed the one line that explains a fatal crash.
  opts.logger?.error('process_error_captured', {
    errorCode: 'process_fatal',
    error_type: errorReport.error_type,
    outcome: origin === 'unhandled_rejection' ? 'unhandled_rejection' : 'uncaught_exception',
    httpStatus: errorReport.http_status,
    isOperational: errorReport.operational,
  });
  await flushWithTimeout(opts.client);
  (opts.exit ?? process.exit)(1);
}

async function flushWithTimeout(client: TelemetryClient): Promise<void> {
  const timer = new Promise<void>((resolve) => setTimeout(resolve, FLUSH_TIMEOUT_MS).unref());
  await Promise.race([client.flush().catch(() => undefined), timer]);
}

// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import { checkSafeLogContext, type Logger, type LogContext } from '@folklore/core';
import type { ErrorReport } from '@folklore/errors';
import { installGlobalErrorReporting } from '../src/index.js';
import type { TelemetryClient } from '../src/ports.js';

type ProcessEvent = 'uncaughtException' | 'unhandledRejection';

class RecordingClient implements TelemetryClient {
  readonly order: string[] = [];
  readonly errors: ErrorReport[] = [];
  track(): void {}
  captureError(report: ErrorReport): void {
    this.errors.push(report);
    this.order.push('captureError');
  }
  async flush(): Promise<void> {
    this.order.push('flush');
  }
}

class RecordingLogger implements Logger {
  readonly records: { event: string; context: LogContext | undefined }[] = [];

  trace(): void {}
  debug(): void {}
  info(): void {}
  warn(): void {}
  fatal(): void {}
  error(event: string, context?: LogContext): void {
    this.records.push({ event, context });
  }
  child(): Logger {
    return this;
  }
}

function fireNewestListener(event: ProcessEvent, arg: unknown): void {
  const handler = process.listeners(event).at(-1) as (value: unknown) => void;
  handler(arg);
}

async function runFatal(
  event: ProcessEvent,
  arg: unknown,
  logger?: Logger,
): Promise<RecordingClient> {
  const client = new RecordingClient();
  // The injected exit resolves `exited` so the test can await the fire-and-forget chain.
  let onExit: () => void = () => {};
  const exited = new Promise<void>((resolve) => {
    onExit = resolve;
  });
  const uninstall = installGlobalErrorReporting({
    client,
    component: 'test',
    ...(logger ? { logger } : {}),
    exit: (code) => {
      client.order.push(`exit:${code}`);
      onExit();
    },
  });
  fireNewestListener(event, arg);
  await exited;
  uninstall();
  return client;
}

describe('installGlobalErrorReporting', () => {
  it('captures, flushes, then exits(1) on an uncaught exception — exit after flush', async () => {
    const client = await runFatal('uncaughtException', new Error('boom'));
    expect(client.errors).toHaveLength(1);
    expect(client.errors[0]?.origin).toBe('uncaught');
    expect(client.order).toEqual(['captureError', 'flush', 'exit:1']);
  });

  it('treats an unhandled rejection as fatal and exits after flushing', async () => {
    const client = await runFatal('unhandledRejection', new Error('nope'));
    expect(client.errors[0]?.origin).toBe('unhandled_rejection');
    expect(client.order).toEqual(['captureError', 'flush', 'exit:1']);
  });

  // A fatal crash is the one moment nothing else will explain what happened, so the record has to
  // survive the logging boundary. Spreading the ErrorReport into the context did not: error_name,
  // category, origin and fingerprint are not SAFE_LOG_FIELDS, so the logger dropped the event.
  it('logs a fatal crash through a context the logging boundary accepts', async () => {
    const logger = new RecordingLogger();
    const client = await runFatal(
      'uncaughtException',
      new Error('CUSTOMER_CONTENT_MUST_NOT_BE_LOGGED'),
      logger,
    );

    expect(logger.records).toHaveLength(1);
    const record = logger.records[0];
    expect(record?.event).toBe('process_error_captured');
    expect(record?.context).toMatchObject({
      errorCode: 'process_fatal',
      outcome: 'uncaught_exception',
      isOperational: false,
    });
    expect(checkSafeLogContext(record?.context)).toBeNull();
    // Negative control: the rejected spelling this replaced, proven refused by the same validator.
    expect(checkSafeLogContext({ ...client.errors[0] })).toBe('invalid_context_key');
    expect(JSON.stringify(logger.records)).not.toContain('CUSTOMER_CONTENT_MUST_NOT_BE_LOGGED');
  });
});

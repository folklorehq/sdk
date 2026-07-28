// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
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

function fireNewestListener(event: ProcessEvent, arg: unknown): void {
  const handler = process.listeners(event).at(-1) as (value: unknown) => void;
  handler(arg);
}

async function runFatal(event: ProcessEvent, arg: unknown): Promise<RecordingClient> {
  const client = new RecordingClient();
  // The injected exit resolves `exited` so the test can await the fire-and-forget chain.
  let onExit: () => void = () => {};
  const exited = new Promise<void>((resolve) => {
    onExit = resolve;
  });
  const uninstall = installGlobalErrorReporting({
    client,
    component: 'test',
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
});

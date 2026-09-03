// SPDX-License-Identifier: Apache-2.0
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import type { PinoLoggerOptions } from '../src/index.js';
import type { SafeLogContext } from '@folklore/core';
import { PinoLogger } from '../src/index.js';

const SENTINEL = 'CUSTOMER_CONTENT_MUST_NOT_REACH_PINO';

interface LogRecord {
  msg: string;
  component: string;
  reasonCode?: string;
  [key: string]: unknown;
}

function unsafeContext(context: Record<string, unknown>): SafeLogContext {
  return context as SafeLogContext;
}

function mutableProxyContext(value: string): SafeLogContext {
  return unsafeContext(
    new Proxy(
      { status: 'ok' },
      {
        getOwnPropertyDescriptor(_target, property) {
          if (property !== 'status') return undefined;
          return { configurable: true, enumerable: true, value: 'ok', writable: true };
        },
        get(_target, property) {
          return property === 'status' ? value : undefined;
        },
      },
    ),
  );
}

function recordingLogger(options: Pick<PinoLoggerOptions, 'bindings'> = {}): {
  logger: PinoLogger;
  records: LogRecord[];
} {
  const records: LogRecord[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      records.push(JSON.parse(String(chunk)) as LogRecord);
      callback();
    },
  });
  return { logger: new PinoLogger({ name: 'api', destination, ...options }), records };
}

function expectOnlyRejection(records: LogRecord[], reasonCode: string): void {
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    msg: 'log_record_rejected',
    component: 'api',
    reasonCode,
  });
  expect(JSON.stringify(records)).not.toContain(SENTINEL);
}

describe('PinoLogger', () => {
  it('implements the Logger port', () => {
    const log = new PinoLogger({ level: 'silent' });
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('accepts stable event codes with flat primitive context', () => {
    const { logger, records } = recordingLogger();
    logger.info('request_completed', { attempt: 1, retried: false, route: 'wiki_read' });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      msg: 'request_completed',
      component: 'api',
      attempt: 1,
      retried: false,
      route: 'wiki_read',
    });
  });

  it('accepts bounded content-free inference and SQS correlation fields', () => {
    const { logger, records } = recordingLogger();
    logger.info('synthesis_tokens', {
      orgId: '3e083ed2-433c-4798-ae11-a656c9de08ee',
      messageId: 'd7a6c468-0ddd-4de2-a29b-12af4f2ba28a',
      model: 'qwen/qwen3-32b',
      operation: 'structured',
      calls: 4,
      cachedCalls: 1,
      promptTokens: 160,
      completionTokens: 16,
    });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      msg: 'synthesis_tokens',
      orgId: '3e083ed2-433c-4798-ae11-a656c9de08ee',
      messageId: 'd7a6c468-0ddd-4de2-a29b-12af4f2ba28a',
      model: 'qwen/qwen3-32b',
      operation: 'structured',
      calls: 4,
      cachedCalls: 1,
      promptTokens: 160,
      completionTokens: 16,
    });
  });

  it.each([{ orgId: 'org-1' }, { messageId: SENTINEL }, { model: `qwen/${SENTINEL} words` }])(
    'rejects malformed operational identifiers %#',
    (context) => {
      const { logger, records } = recordingLogger();
      logger.info('synthesis_tokens', unsafeContext(context));
      expectOnlyRejection(records, 'invalid_context_value');
    },
  );

  it.each(['initial', 'child', 'call'] as const)(
    'serializes only descriptor-snapshotted %s context values',
    (surface) => {
      const proxySentinel = 'customer_content_must_not_reach_pino';
      const context = mutableProxyContext(proxySentinel);
      const { logger, records } = recordingLogger(
        surface === 'initial' ? { bindings: context } : {},
      );

      if (surface === 'child') logger.child(context).info('request_completed');
      else if (surface === 'call') logger.info('request_completed', context);
      else logger.info('request_completed');

      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({ msg: 'request_completed', status: 'ok' });
      expect(JSON.stringify(records)).not.toContain(proxySentinel);
    },
  );

  it('accepts safe initial bindings', () => {
    const { logger, records } = recordingLogger({ bindings: { generation: 3 } });
    logger.info('request_completed');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      msg: 'request_completed',
      component: 'api',
      generation: 3,
    });
  });

  it('rejects event text without serializing it', () => {
    const { logger, records } = recordingLogger();
    logger.info(`customer said ${SENTINEL}`);

    expectOnlyRejection(records, 'invalid_event_code');
  });

  it('rejects ordinary unsafe context without serializing it', () => {
    const { logger, records } = recordingLogger();
    logger.info('request_completed', unsafeContext({ body: SENTINEL }));

    expectOnlyRejection(records, 'invalid_context_key');
  });

  it.each(['payload', 'detail', 'value', 'url', 'label'])(
    'rejects arbitrary content under the unregistered %s field',
    (field) => {
      const { logger, records } = recordingLogger();
      logger.info('request_completed', unsafeContext({ [field]: SENTINEL }));

      expectOnlyRejection(records, 'invalid_context_key');
    },
  );

  it('rejects arbitrary content in registered code fields', () => {
    const { logger, records } = recordingLogger();
    logger.info('request_completed', unsafeContext({ route: SENTINEL }));

    expectOnlyRejection(records, 'invalid_context_value');
  });

  it('rejects unsafe child bindings at creation without serializing them', () => {
    const { logger, records } = recordingLogger();
    logger.child(unsafeContext({ payload: SENTINEL })).info('request_completed');

    expectOnlyRejection(records, 'invalid_child_bindings');
  });

  it('rejects unsafe initial bindings without serializing them', () => {
    const { logger, records } = recordingLogger({
      bindings: unsafeContext({ payload: SENTINEL }),
    });
    logger.info('request_completed');

    expectOnlyRejection(records, 'invalid_child_bindings');
  });

  it('merges valid child bindings into the guarded record', () => {
    const { logger, records } = recordingLogger();
    const bindings: SafeLogContext = { requestId: 'request_1' };
    const child = logger.child(bindings);
    child.info('request_completed', { attempt: 1 });

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      msg: 'request_completed',
      requestId: 'request_1',
      attempt: 1,
    });
  });

  it('preserves a validated child component', () => {
    const { logger, records } = recordingLogger();
    logger.child({ component: 'billing' }).info('request_completed');

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      msg: 'request_completed',
      component: 'billing',
    });
  });

  it('rejects raw Error values, including non-enumerable fields', () => {
    const { logger, records } = recordingLogger();
    const error = new Error(SENTINEL);
    Object.defineProperty(error, 'privateDetail', { value: SENTINEL, enumerable: false });
    logger.error('request_failed', unsafeContext({ err: error }));

    expectOnlyRejection(records, 'invalid_context_key');
  });

  it('rejects values that would require truncation', () => {
    const { logger, records } = recordingLogger();
    logger.info('request_completed', unsafeContext({ detail: SENTINEL.repeat(16) }));

    expectOnlyRejection(records, 'invalid_context_key');
  });

  it('rejects encoded content without serializing it', () => {
    const { logger, records } = recordingLogger();
    const encoded = Buffer.from(SENTINEL.repeat(16)).toString('base64');
    logger.info('request_completed', unsafeContext({ detail: encoded }));

    expectOnlyRejection(records, 'invalid_context_key');
  });

  it('rejects raw Error values in registered fields', () => {
    const { logger, records } = recordingLogger();
    const error = new Error(SENTINEL);
    logger.error('request_failed', unsafeContext({ count: error }));

    expectOnlyRejection(records, 'invalid_context_value');
  });

  it('rejects long registered-field values without truncating', () => {
    const { logger, records } = recordingLogger();
    logger.info('request_completed', unsafeContext({ count: SENTINEL.repeat(16) }));

    expectOnlyRejection(records, 'invalid_context_value');
  });

  it('rejects encoded content in registered fields', () => {
    const { logger, records } = recordingLogger();
    const encoded = Buffer.from(SENTINEL.repeat(16)).toString('base64');
    logger.info('request_completed', unsafeContext({ count: encoded }));

    expectOnlyRejection(records, 'invalid_context_value');
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '../src/index.js';

describe('PinoLogger', () => {
  it('implements the Logger port', () => {
    const log = new PinoLogger({ level: 'silent' });
    expect(typeof log.info).toBe('function');
    expect(typeof log.error).toBe('function');
  });

  it('creates child loggers with bindings', () => {
    const child = new PinoLogger({ level: 'silent' }).child({ module: 'test' });
    expect(typeof child.info).toBe('function');
  });

  it('does not throw when logging with context', () => {
    const log = new PinoLogger({ level: 'silent' });
    expect(() => log.info('hello', { requestId: 'abc' })).not.toThrow();
  });
});

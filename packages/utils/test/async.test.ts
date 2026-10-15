// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortAfter } from '../src/async.js';

const TIMEOUT_MS = 1_000;

describe('abortAfter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts with a TimeoutError once the timer elapses', () => {
    const controller = new AbortController();
    abortAfter(controller, TIMEOUT_MS);
    vi.advanceTimersByTime(TIMEOUT_MS - 1);
    expect(controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(controller.signal.reason).toBeInstanceOf(DOMException);
    expect(controller.signal.reason).toMatchObject({ name: 'TimeoutError' });
  });

  it('never aborts once the caller clears the timer', () => {
    const controller = new AbortController();
    clearTimeout(abortAfter(controller, TIMEOUT_MS));
    vi.advanceTimersByTime(TIMEOUT_MS * 2);
    expect(controller.signal.aborted).toBe(false);
  });
});

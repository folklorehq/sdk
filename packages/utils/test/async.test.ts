// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortAfter, primaryRejection } from '../src/async.js';

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

describe('primaryRejection', () => {
  const secondary = new Error('secondary');
  const isSecondary = (reason: unknown): boolean => reason === secondary;

  it('is undefined when nothing rejected', () => {
    expect(primaryRejection([{ status: 'fulfilled', value: 1 }], isSecondary)).toBeUndefined();
  });

  it('picks the lowest-index rejection that is not secondary', () => {
    const first = new Error('first');
    const second = new Error('second');
    const results: PromiseSettledResult<number>[] = [
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: secondary },
      { status: 'rejected', reason: first },
      { status: 'rejected', reason: second },
    ];
    expect(primaryRejection(results, isSecondary)?.reason).toBe(first);
  });

  it('falls back to the lowest rejection when every rejection is secondary', () => {
    const later = new Error('later');
    const results: PromiseSettledResult<number>[] = [
      { status: 'rejected', reason: secondary },
      { status: 'rejected', reason: later },
    ];
    expect(primaryRejection(results, (r) => r === secondary || r === later)?.reason).toBe(
      secondary,
    );
  });

  it('treats every rejection as primary without a predicate', () => {
    const results: PromiseSettledResult<number>[] = [
      { status: 'rejected', reason: secondary },
      { status: 'rejected', reason: new Error('x') },
    ];
    expect(primaryRejection(results)?.reason).toBe(secondary);
  });
});

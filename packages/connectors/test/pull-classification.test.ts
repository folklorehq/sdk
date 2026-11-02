// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isCalendarCreateEvent, isCreateEvent } from '../src/pull-classification.js';

const WINDOW_START = '2025-06-01T00:00:00.000Z';

describe('isCreateEvent', () => {
  it('is a create when there is no lower bound', () => {
    expect(isCreateEvent('2026-01-01T00:00:00Z', undefined)).toBe(true);
    expect(isCreateEvent(undefined, undefined)).toBe(true);
  });

  it('is a create when the record was born inside the window', () => {
    expect(isCreateEvent('2026-01-01T00:00:00Z', WINDOW_START)).toBe(true);
  });

  it('is a create when the record was born exactly at the window boundary', () => {
    expect(isCreateEvent(WINDOW_START, WINDOW_START)).toBe(true);
  });

  it('is an update when the record predates the window', () => {
    expect(isCreateEvent('2025-01-01T00:00:00Z', WINDOW_START)).toBe(false);
  });
});

describe('isCalendarCreateEvent', () => {
  it('is a create for an in-window event with no updated timestamp', () => {
    expect(isCalendarCreateEvent('2026-01-01T00:00:00Z', undefined, WINDOW_START)).toBe(true);
  });

  it('is an update for an in-window event edited after creation', () => {
    expect(
      isCalendarCreateEvent('2026-01-01T00:00:00Z', '2026-07-01T00:00:00Z', WINDOW_START),
    ).toBe(false);
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime, utcDayStart } from '../src/time.js';

const NOW = Date.parse('2026-10-02T12:00:00.000Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ELAPSED_SAMPLES = [
  -5 * MINUTE,
  0,
  1,
  30 * SECOND,
  59 * SECOND + 999,
  MINUTE,
  MINUTE + 1,
  90 * SECOND,
  119 * SECOND,
  5 * MINUTE,
  44 * MINUTE + 29 * SECOND,
  59 * MINUTE,
  59 * MINUTE + 40 * SECOND,
  HOUR - 1,
  HOUR,
  HOUR + 29 * MINUTE,
  HOUR + 30 * MINUTE,
  5 * HOUR,
  23 * HOUR + 40 * MINUTE,
  DAY - 1,
  DAY,
  DAY + 11 * HOUR,
  DAY + 12 * HOUR,
  6 * DAY + 23 * HOUR,
  7 * DAY,
  13 * DAY,
  29 * DAY + 23 * HOUR,
  30 * DAY,
  45 * DAY,
  400 * DAY,
];

function isoAt(elapsed: number): string {
  return new Date(NOW - elapsed).toISOString();
}

function legacyDashboard(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, NOW - then);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  const days = Math.floor(diff / DAY);
  return days < 7 ? `${days}d` : `${Math.floor(days / 7)}w`;
}

function legacyNotifications(iso: string): string {
  const secs = Math.max(0, (NOW - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86_400) return `${Math.floor(secs / 3600)}h`;
  return `${Math.floor(secs / 86_400)}d`;
}

function legacyComments(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const delta = NOW - then;
  if (delta < MINUTE) return 'just now';
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`;
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`;
  return `${Math.floor(delta / DAY)}d ago`;
}

function legacyConnectionStatus(iso: string | null): string {
  if (!iso) return 'never';
  const delta = NOW - new Date(iso).getTime();
  if (delta < HOUR) return `${Math.max(1, Math.round(delta / MINUTE))}m ago`;
  if (delta < DAY) return `${Math.round(delta / HOUR)}h ago`;
  return `${Math.round(delta / DAY)}d ago`;
}

function legacyCheckIn(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'no check-in yet';
  const elapsed = NOW - new Date(lastSeenAt).getTime();
  if (elapsed < MINUTE) return 'checked in just now';
  if (elapsed < HOUR) return `checked in ${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `checked in ${Math.floor(elapsed / HOUR)}h ago`;
  return `checked in ${Math.floor(elapsed / DAY)}d ago`;
}

function legacyOperator(iso: string | null): string {
  if (iso === null) return 'Never';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return 'Not reported';
  const elapsed = Math.max(0, NOW - time);
  if (elapsed < MINUTE) return 'Just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < 30 * DAY) return `${Math.floor(elapsed / DAY)}d ago`;
  return formatAbsoluteTime(iso, 'Not reported');
}

function legacyFleetSeen(iso: string | null): string {
  if (!iso) return 'Never';
  const age = NOW - new Date(iso).getTime();
  const minutes = Math.floor(age / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

describe('formatRelativeTime matches every legacy caller', () => {
  it.each(ELAPSED_SAMPLES)('compact style, box dashboard (on main), elapsed %d ms', (elapsed) => {
    expect(formatRelativeTime(isoAt(elapsed), NOW, { style: 'compact' })).toBe(
      legacyDashboard(isoAt(elapsed)),
    );
  });

  it.each(ELAPSED_SAMPLES)(
    'compact style without weeks, notifications, elapsed %d ms',
    (elapsed) => {
      expect(
        formatRelativeTime(isoAt(elapsed), NOW, {
          style: 'compact',
          justNowLabel: 'now',
          weeks: false,
        }),
      ).toBe(legacyNotifications(isoAt(elapsed)));
    },
  );

  it.each(ELAPSED_SAMPLES)('ago style, wiki comments, elapsed %d ms', (elapsed) => {
    expect(formatRelativeTime(isoAt(elapsed), NOW, { style: 'ago' })).toBe(
      legacyComments(isoAt(elapsed)),
    );
  });

  it.each(ELAPSED_SAMPLES)('ago style rounded to nearest, roster connections, %d ms', (elapsed) => {
    expect(
      formatRelativeTime(isoAt(elapsed), NOW, {
        style: 'ago',
        rounding: 'nearest',
        nullLabel: 'never',
      }),
    ).toBe(legacyConnectionStatus(isoAt(elapsed)));
  });

  it.each(ELAPSED_SAMPLES)('ago style, health strip check-in, elapsed %d ms', (elapsed) => {
    const iso = isoAt(elapsed);
    const relative = formatRelativeTime(iso, NOW, { style: 'ago' });
    expect(`checked in ${relative}`).toBe(legacyCheckIn(iso));
  });

  it.each(ELAPSED_SAMPLES)(
    'ago style with absolute fallback, operator shell branch (not on main), elapsed %d ms',
    (elapsed) => {
      expect(
        formatRelativeTime(isoAt(elapsed), NOW, {
          style: 'ago',
          justNowLabel: 'Just now',
          nullLabel: 'Never',
          invalidLabel: 'Not reported',
          absoluteAfterDays: 30,
        }),
      ).toBe(legacyOperator(isoAt(elapsed)));
    },
  );

  it.each(ELAPSED_SAMPLES.filter((elapsed) => elapsed >= 0))(
    'ago style, operator fleet last seen (on main), elapsed %d ms',
    (elapsed) => {
      expect(
        formatRelativeTime(isoAt(elapsed), NOW, {
          style: 'ago',
          justNowLabel: 'Just now',
          nullLabel: 'Never',
          invalidLabel: 'Never',
        }),
      ).toBe(legacyFleetSeen(isoAt(elapsed)));
    },
  );

  it.each(['', 'not-a-date'])('operator fleet last seen reads Never for %j', (bad) => {
    expect(
      formatRelativeTime(bad, NOW, {
        style: 'ago',
        justNowLabel: 'Just now',
        nullLabel: 'Never',
        invalidLabel: 'Never',
      }),
    ).toBe('Never');
  });
});

describe('formatRelativeTime edge cases', () => {
  it('returns the null label, empty by default', () => {
    expect(formatRelativeTime(null, NOW)).toBe('');
    expect(formatRelativeTime(null, NOW, { nullLabel: 'Never' })).toBe('Never');
  });

  it('returns the invalid label for an unparseable timestamp', () => {
    expect(formatRelativeTime('not a date', NOW)).toBe('');
    expect(formatRelativeTime('not a date', NOW, { invalidLabel: 'Not reported' })).toBe(
      'Not reported',
    );
  });

  it('never reads a future timestamp as anything but just now', () => {
    expect(formatRelativeTime(isoAt(-DAY), NOW, { style: 'ago' })).toBe('just now');
  });

  it('uses the wall clock when no reference time is given', () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe('just now');
  });
});

describe('formatAbsoluteTime', () => {
  it('formats a timestamp with a date and a time', () => {
    const formatted = formatAbsoluteTime('2026-10-02T12:00:00.000Z');
    expect(formatted).toMatch(/2026/);
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });

  it('returns the invalid label for an unparseable timestamp', () => {
    expect(formatAbsoluteTime('nope')).toBe('');
    expect(formatAbsoluteTime('nope', 'Not reported')).toBe('Not reported');
  });
});

describe('utcDayStart', () => {
  it('returns the UTC midnight of the instant, one millisecond before the next day', () => {
    expect(utcDayStart(new Date('2026-10-14T23:59:59.999Z')).toISOString()).toBe(
      '2026-10-14T00:00:00.000Z',
    );
  });

  it('is its own value at exactly UTC midnight', () => {
    expect(utcDayStart(new Date('2026-10-15T00:00:00.000Z')).toISOString()).toBe(
      '2026-10-15T00:00:00.000Z',
    );
  });

  it('ignores the offset the instant was written in', () => {
    expect(utcDayStart(new Date('2026-10-15T09:30:00+14:00')).toISOString()).toBe(
      '2026-10-14T00:00:00.000Z',
    );
  });
});

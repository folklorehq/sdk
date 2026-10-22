// SPDX-License-Identifier: Apache-2.0
export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
const DAYS_PER_WEEK = 7;
const DEFAULT_JUST_NOW = 'just now';

const ABSOLUTE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export type RelativeTimeStyle = 'compact' | 'ago';

export type RelativeTimeOptions = {
  style?: RelativeTimeStyle;
  nullLabel?: string;
  invalidLabel?: string;
  justNowLabel?: string;
  weeks?: boolean;
  absoluteAfterDays?: number;
  rounding?: 'floor' | 'nearest';
};

type Rounding = NonNullable<RelativeTimeOptions['rounding']>;
type RelativeUnit = { count: number; suffix: 'm' | 'h' | 'd' };

export function formatAbsoluteTime(iso: string, invalidLabel = ''): string {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? invalidLabel : ABSOLUTE_FORMAT.format(time);
}

function wholeUnit(elapsed: number, rounding: Rounding): RelativeUnit | null {
  const toCount = rounding === 'nearest' ? Math.round : Math.floor;
  const minimumMinutes = rounding === 'nearest' ? 1 : 0;
  if (elapsed < MS_PER_HOUR) {
    const minutes = Math.max(minimumMinutes, toCount(elapsed / MS_PER_MINUTE));
    return minutes === 0 ? null : { count: minutes, suffix: 'm' };
  }
  if (elapsed < MS_PER_DAY) return { count: toCount(elapsed / MS_PER_HOUR), suffix: 'h' };
  return { count: toCount(elapsed / MS_PER_DAY), suffix: 'd' };
}

function withWeeks({ count, suffix }: RelativeUnit): string {
  const isWeeks = suffix === 'd' && count >= DAYS_PER_WEEK;
  return isWeeks ? `${Math.floor(count / DAYS_PER_WEEK)}w` : `${count}${suffix}`;
}

function describeUnit(unit: RelativeUnit, options: RelativeTimeOptions): string {
  if (options.style === 'ago') return `${unit.count}${unit.suffix} ago`;
  return options.weeks === false ? `${unit.count}${unit.suffix}` : withWeeks(unit);
}

export function formatRelativeTime(
  iso: string | null,
  now: number = Date.now(),
  options: RelativeTimeOptions = {},
): string {
  if (iso === null) return options.nullLabel ?? '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return options.invalidLabel ?? '';
  // A server clock slightly ahead of this browser must not read as a future time.
  const elapsed = Math.max(0, now - time);
  const { absoluteAfterDays } = options;
  if (absoluteAfterDays !== undefined && elapsed >= absoluteAfterDays * MS_PER_DAY) {
    return formatAbsoluteTime(iso, options.invalidLabel);
  }
  const unit = wholeUnit(elapsed, options.rounding ?? 'floor');
  return unit === null ? (options.justNowLabel ?? DEFAULT_JUST_NOW) : describeUnit(unit, options);
}

export function utcDayStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

const UTC_DAY_KEY_LENGTH = 10;

export function utcDayKey(at: Date): string {
  return at.toISOString().slice(0, UTC_DAY_KEY_LENGTH);
}

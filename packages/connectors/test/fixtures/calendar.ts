// SPDX-License-Identifier: Apache-2.0
import type { CalendarEvent } from '../../src/calendar/types.js';

export function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    summary: 'Sprint planning',
    status: 'confirmed',
    start: { dateTime: '2026-08-03T09:00:00Z', timeZone: 'UTC' },
    end: { dateTime: '2026-08-03T10:00:00Z', timeZone: 'UTC' },
    attendees: [
      { email: 'a@x.test', displayName: 'Alice' },
      { email: 'b@x.test', displayName: 'Bob' },
    ],
    organizer: { email: 'organizer@x.test', displayName: 'Organizer' },
    joinUrl: 'https://calendar.example.test/meeting',
    created: '2026-07-01T00:00:00.000Z',
    updated: '2026-07-01T00:00:00.000Z',
    ...overrides,
  };
}

// SPDX-License-Identifier: Apache-2.0
// Canonical shape shared by the google_calendar and microsoft365_calendar normalizers; each
// provider client maps its API response onto it (email/meeting sharing precedent).
export interface CalendarAttendee {
  email?: string;
  displayName?: string;
}

export interface CalendarEventTime {
  dateTime?: string;
  // All-day events carry a date-only value; both providers must populate it so the body renders
  // When:/End: for all-day events.
  date?: string;
  timeZone?: string;
}

export interface CalendarOrganizer {
  id?: string;
  email?: string;
  displayName?: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  status?: string;
  start?: CalendarEventTime;
  end?: CalendarEventTime;
  attendees?: CalendarAttendee[];
  organizer?: CalendarOrganizer;
  location?: string;
  joinUrl?: string;
  recurrence?: unknown;
  recurringEventId?: string;
  created?: string;
  updated?: string;
}

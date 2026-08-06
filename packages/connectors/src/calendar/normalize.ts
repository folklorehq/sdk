// SPDX-License-Identifier: Apache-2.0
import { extractExplicitLinks } from '../github/normalize.js';
import type {
  NormalizedActor,
  NormalizedContainer,
  NormalizedFact,
  NormalizedRecords,
} from '../normalized.js';
import type { CalendarAttendee, CalendarEvent, CalendarEventTime } from './types.js';

const CONTAINER_LABEL = 'calendar_event';

type CalendarNamespace = 'gcal' | 'm365cal';

export function calendarEventContainerId(eventId: string): string {
  return containerIdFor('gcal', eventId);
}

export function microsoft365CalendarContainerId(eventId: string): string {
  return containerIdFor('m365cal', eventId);
}

// A recurring series is one Container keyed by its master event id; a modified instance becomes a
// transition Fact against the master (invariant #1) — the master's content Fact is never mutated.
export function normalizeCalendarEvent(
  event: CalendarEvent,
  type: 'created' | 'updated',
): NormalizedRecords {
  return normalizeCalendarEventFor(event, type, 'gcal');
}

export function normalizeMicrosoft365CalendarEvent(
  event: CalendarEvent,
  type: 'created' | 'updated',
): NormalizedRecords {
  return normalizeCalendarEventFor(event, type, 'm365cal');
}

// One normalizer for both providers (email pair precedent); fact and container ids keep the
// provider prefix so the two calendars never collide in containerProvenance.
function normalizeCalendarEventFor(
  event: CalendarEvent,
  type: 'created' | 'updated',
  ns: CalendarNamespace,
): NormalizedRecords {
  const masterId = event.recurringEventId;
  if (masterId !== undefined) return normalizeInstanceOverride(event, masterId, ns);
  return type === 'created' ? normalizeEventCreated(event, ns) : normalizeEventUpdated(event, ns);
}

// Every path emits the container seed: `created` is immutable, so a series born before the pull
// window classifies 'updated' forever — without the seed its transitions would dangle. Re-seeding
// is safe because upsertContainer is idempotent (first-sight seed, never a mutation).
function normalizeEventCreated(event: CalendarEvent, ns: CalendarNamespace): NormalizedRecords {
  const containerId = containerIdFor(ns, event.id);
  const facts: NormalizedFact[] = [createdFact(event, containerId, ns)];
  if (event.status === 'cancelled') facts.push(cancelledTransition(event, containerId, ns));
  return { containers: [seedContainer(containerId, event.id)], facts };
}

function normalizeEventUpdated(event: CalendarEvent, ns: CalendarNamespace): NormalizedRecords {
  const containerId = containerIdFor(ns, event.id);
  const revision = revisionKey(event);
  const cancelled = event.status === 'cancelled';
  return {
    containers: [seedContainer(containerId, event.id)],
    facts: [
      updatedFact(event, containerId, revision, ns),
      {
        sourceFactId: `${ns}:event:${cancelled ? 'cancelled' : 'derived'}:${event.id}:${revision}`,
        kind: 'transition',
        occurredAt: eventTime(event.updated, event.created),
        resourceExternalId: event.id,
        authors: organizerActor(event),
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: [event.id],
        transition: cancelled
          ? { transitionType: 'cancelled', detail: { field: 'status', to: 'cancelled' } }
          : { transitionType: 'derived_from', detail: { field: 'revision', to: revision } },
        raw: event,
      },
    ],
  };
}

// Microsoft's calendarView never returns the series master, so a first-sight instance carries the
// seed content for the series container; Google returns the master itself and the re-seed is a no-op.
function normalizeInstanceOverride(
  event: CalendarEvent,
  masterId: string,
  ns: CalendarNamespace,
): NormalizedRecords {
  const containerId = containerIdFor(ns, masterId);
  return {
    containers: [seedContainer(containerId, masterId)],
    facts: [
      instanceContentFact(event, containerId, ns),
      {
        sourceFactId: `${ns}:event:instance:${event.id}:${revisionKey(event)}`,
        kind: 'transition',
        occurredAt: eventTime(event.updated, event.created),
        resourceExternalId: event.id,
        authors: organizerActor(event),
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: [event.id],
        transition:
          event.status === 'cancelled'
            ? { transitionType: 'cancelled', detail: { field: 'instance', to: event.id } }
            : { transitionType: 'instance_override', detail: { field: 'instance', to: event.id } },
        raw: event,
      },
    ],
  };
}

function containerIdFor(ns: CalendarNamespace, eventId: string): string {
  return `${ns}:event:${eventId}`;
}

function seedContainer(containerId: string, resourceExternalId: string): NormalizedContainer {
  return {
    sourceContainerId: containerId,
    shape: 'event',
    label: CONTAINER_LABEL,
    resourceExternalId,
  };
}

function createdFact(
  event: CalendarEvent,
  containerId: string,
  ns: CalendarNamespace,
): NormalizedFact {
  const body = eventBody(event);
  return {
    sourceFactId: `${ns}:event:created:${event.id}`,
    kind: 'content',
    occurredAt: eventTime(event.created, event.updated),
    resourceExternalId: event.id,
    authors: organizerActor(event),
    containerRefs: [containerId],
    sourceThreadId: containerId,
    entities: [event.id],
    content: { body, explicitLinks: extractExplicitLinks(body) },
    raw: event,
  };
}

function updatedFact(
  event: CalendarEvent,
  containerId: string,
  revision: string,
  ns: CalendarNamespace,
): NormalizedFact {
  const body = eventBody(event);
  return {
    sourceFactId: `${ns}:event:updated:${event.id}:${revision}`,
    kind: 'content',
    occurredAt: eventTime(event.updated, event.created),
    resourceExternalId: event.id,
    authors: organizerActor(event),
    containerRefs: [containerId],
    sourceThreadId: containerId,
    entities: [event.id],
    content: { body, explicitLinks: extractExplicitLinks(body) },
    raw: event,
  };
}

// The instance's own revision keys the fact so a rescheduled occurrence lands a new content fact
// (append-only) instead of deduping onto stale content.
function instanceContentFact(
  event: CalendarEvent,
  containerId: string,
  ns: CalendarNamespace,
): NormalizedFact {
  const body = eventBody(event);
  return {
    sourceFactId: `${ns}:event:instance-content:${event.id}:${revisionKey(event)}`,
    kind: 'content',
    occurredAt: eventTime(event.updated, event.created),
    resourceExternalId: event.id,
    authors: organizerActor(event),
    containerRefs: [containerId],
    sourceThreadId: containerId,
    entities: [event.id],
    content: { body, explicitLinks: extractExplicitLinks(body) },
    raw: event,
  };
}

function cancelledTransition(
  event: CalendarEvent,
  containerId: string,
  ns: CalendarNamespace,
): NormalizedFact {
  return {
    sourceFactId: `${ns}:event:cancelled:${event.id}:${revisionKey(event)}`,
    kind: 'transition',
    occurredAt: eventTime(event.updated, event.created),
    resourceExternalId: event.id,
    authors: organizerActor(event),
    containerRefs: [containerId],
    sourceThreadId: containerId,
    entities: [event.id],
    transition: { transitionType: 'cancelled', detail: { field: 'status', to: 'cancelled' } },
    raw: event,
  };
}

function organizerActor(event: CalendarEvent): NormalizedActor[] {
  const organizer = event.organizer;
  if (!organizer) return [];
  const sourceUserId = organizer.email ?? organizer.id ?? organizer.displayName;
  if (!sourceUserId) return [];
  return [
    { sourceUserId, email: organizer.email, displayName: organizer.displayName, role: 'author' },
  ];
}

// Summary and the event's content-derived metadata (time, attendees, status, join url) — attendee
// emails and join urls are content and live only inside the encrypted container body.
function eventBody(event: CalendarEvent): string {
  const lines = [event.summary];
  const start = timeLabel(event.start);
  if (start) lines.push(`When: ${start}`);
  const end = timeLabel(event.end);
  if (end) lines.push(`End: ${end}`);
  if (event.status) lines.push(`Status: ${event.status}`);
  const attendees = (event.attendees ?? [])
    .map(attendeeLabel)
    .filter((label): label is string => label !== '');
  if (attendees.length > 0) lines.push(`Attendees: ${attendees.join(', ')}`);
  if (event.joinUrl) lines.push(`Join: ${event.joinUrl}`);
  if (event.location) lines.push(`Location: ${event.location}`);
  return lines.join('\n');
}

function timeLabel(time: CalendarEventTime | undefined): string {
  return time?.dateTime ?? time?.date ?? '';
}

function attendeeLabel(attendee: CalendarAttendee): string {
  if (attendee.displayName && attendee.email) return `${attendee.displayName} <${attendee.email}>`;
  return attendee.displayName ?? attendee.email ?? '';
}

// A malformed upstream timestamp must never abort the pull; the safe parse falls back to ingest time.
function eventTime(...candidates: Array<string | undefined>): Date {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

function revisionKey(event: CalendarEvent): string {
  return event.updated ?? event.created ?? 'never';
}

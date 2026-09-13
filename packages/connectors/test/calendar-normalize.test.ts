// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  normalizeCalendarEvent,
  normalizeMicrosoft365CalendarEvent,
} from '../src/calendar/normalize.js';
import type { NormalizedRecords } from '../src/normalized.js';
import type { CalendarEvent } from '../src/calendar/types.js';

type CalendarNormalizer = (event: CalendarEvent, type: 'created' | 'updated') => NormalizedRecords;

type CalendarProvider = {
  name: string;
  namespace: 'gcal' | 'm365cal';
  normalize: CalendarNormalizer;
};

const providers: CalendarProvider[] = [
  { name: 'Google Calendar', namespace: 'gcal', normalize: normalizeCalendarEvent },
  {
    name: 'Microsoft 365 Calendar',
    namespace: 'm365cal',
    normalize: normalizeMicrosoft365CalendarEvent,
  },
];

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
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

for (const provider of providers) {
  describe(`${provider.name} shared normalizer`, () => {
    it('seeds a created event with content and metadata', () => {
      const result = provider.normalize(makeEvent(), 'created');
      const fact = result.facts[0]!;

      expect(result.containers).toEqual([
        {
          sourceContainerId: `${provider.namespace}:event:evt-1`,
          shape: 'event',
          label: 'calendar_event',
          resourceExternalId: 'evt-1',
        },
      ]);
      expect(result.facts).toHaveLength(1);
      expect(fact).toMatchObject({
        kind: 'content',
        sourceFactId: `${provider.namespace}:event:created:evt-1`,
        resourceExternalId: 'evt-1',
        containerRefs: [`${provider.namespace}:event:evt-1`],
        sourceThreadId: `${provider.namespace}:event:evt-1`,
        entities: ['evt-1'],
      });
      expect(fact.occurredAt.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(fact.content?.body).toContain('Sprint planning');
      expect(fact.content?.body).toContain('When: 2026-08-03T09:00:00Z');
      expect(fact.content?.body).toContain('End: 2026-08-03T10:00:00Z');
      expect(fact.content?.body).toContain('Status: confirmed');
      expect(fact.content?.body).toContain('Attendees: Alice <a@x.test>, Bob <b@x.test>');
      expect(fact.content?.body).toContain('Join: https://calendar.example.test/meeting');
      expect(fact.content?.explicitLinks).toContain('https://calendar.example.test/meeting');
      expect(fact.authors[0]).toMatchObject({ sourceUserId: 'organizer@x.test', role: 'author' });
    });

    it('preserves explicit timezone offsets in event content', () => {
      const result = provider.normalize(
        makeEvent({
          start: { dateTime: '2026-08-03T09:00:00-07:00', timeZone: 'America/Los_Angeles' },
          end: { dateTime: '2026-08-03T10:00:00-07:00', timeZone: 'America/Los_Angeles' },
        }),
        'created',
      );

      expect(result.facts[0]?.content?.body).toContain('When: 2026-08-03T09:00:00-07:00');
      expect(result.facts[0]?.content?.body).toContain('End: 2026-08-03T10:00:00-07:00');
    });

    it('adds a cancelled transition to a cancelled created event', () => {
      const result = provider.normalize(makeEvent({ status: 'cancelled' }), 'created');
      const transition = result.facts.find((fact) => fact.kind === 'transition')!;

      expect(result.facts).toHaveLength(2);
      expect(transition.transition).toMatchObject({
        transitionType: 'cancelled',
        detail: { field: 'status', to: 'cancelled' },
      });
      expect(transition.containerRefs).toContain(`${provider.namespace}:event:evt-1`);
    });

    it('emits revision content and a derived_from transition for an update', () => {
      const result = provider.normalize(makeEvent(), 'updated');
      const content = result.facts.find((fact) => fact.kind === 'content')!;
      const transition = result.facts.find((fact) => fact.kind === 'transition')!;

      expect(result.facts).toHaveLength(2);
      expect(content.sourceFactId).toBe(
        `${provider.namespace}:event:updated:evt-1:2026-07-01T00:00:00.000Z`,
      );
      expect(content.content?.body).toContain('Sprint planning');
      expect(transition.transition).toMatchObject({
        transitionType: 'derived_from',
        detail: { field: 'revision', to: '2026-07-01T00:00:00.000Z' },
      });
    });

    it('seeds the container on the updated path', () => {
      const result = provider.normalize(makeEvent(), 'updated');

      expect(result.containers).toEqual([
        {
          sourceContainerId: `${provider.namespace}:event:evt-1`,
          shape: 'event',
          label: 'calendar_event',
          resourceExternalId: 'evt-1',
        },
      ]);
    });

    it('emits a cancelled transition instead of derived_from for a cancelled update', () => {
      const result = provider.normalize(makeEvent({ status: 'cancelled' }), 'updated');
      const transition = result.facts.find((fact) => fact.kind === 'transition')!;

      expect(transition.transition?.transitionType).toBe('cancelled');
    });

    it('normalizes all-day, attendee-less, location, and missing-time values', () => {
      const allDay = provider.normalize(
        makeEvent({ start: { date: '2026-08-03' }, end: { date: '2026-08-04' } }),
        'created',
      );
      const attendeeLess = provider.normalize(
        makeEvent({ attendees: undefined, organizer: undefined }),
        'created',
      );
      const location = provider.normalize(
        makeEvent({ joinUrl: 'Room 4B', location: 'Room 4B' }),
        'created',
      );
      const missingTimes = provider.normalize(
        makeEvent({ created: undefined, updated: undefined }),
        'created',
      );

      expect(allDay.facts[0]?.content?.body).toContain('When: 2026-08-03');
      expect(allDay.facts[0]?.content?.body).toContain('End: 2026-08-04');
      expect(attendeeLess.facts).toHaveLength(1);
      expect(attendeeLess.facts[0]!.authors).toHaveLength(0);
      expect(attendeeLess.facts[0]!.content?.body).not.toContain('Attendees:');
      expect(location.facts[0]?.content?.body).toContain('Join: Room 4B');
      expect(location.facts[0]?.content?.body).toContain('Location: Room 4B');
      expect(Number.isNaN(missingTimes.facts[0]!.occurredAt.getTime())).toBe(false);
    });

    it('seeds a recurring series master', () => {
      const result = provider.normalize(
        makeEvent({ recurrence: ['RRULE:FREQ=WEEKLY;COUNT=10'] }),
        'created',
      );

      expect(result.containers).toHaveLength(1);
      expect(result.containers[0]!.sourceContainerId).toBe(`${provider.namespace}:event:evt-1`);
      expect(result.facts).toHaveLength(1);
    });

    it('turns a modified instance into a transition against its master', () => {
      const override = makeEvent({
        id: 'evt-occurrence-1',
        recurringEventId: 'evt-1',
        created: '2026-07-20T00:00:00.000Z',
        updated: '2026-07-21T00:00:00.000Z',
      });
      const result = provider.normalize(override, 'created');
      const transition = result.facts.find((fact) => fact.kind === 'transition')!;

      expect(result.facts).toHaveLength(2);
      expect(transition.transition).toMatchObject({
        transitionType: 'instance_override',
        detail: { field: 'instance', to: 'evt-occurrence-1' },
      });
      expect(transition.containerRefs).toContain(`${provider.namespace}:event:evt-1`);
    });

    it('seeds a first-sight instance with its own content', () => {
      const override = makeEvent({
        id: 'evt-occurrence-1',
        recurringEventId: 'evt-1',
        created: '2024-01-01T00:00:00.000Z',
        updated: '2026-08-01T00:00:00.000Z',
      });
      const result = provider.normalize(override, 'updated');
      const content = result.facts.find((fact) => fact.kind === 'content')!;

      expect(result.containers).toEqual([
        {
          sourceContainerId: `${provider.namespace}:event:evt-1`,
          shape: 'event',
          label: 'calendar_event',
          resourceExternalId: 'evt-1',
        },
      ]);
      expect(content.sourceFactId).toBe(
        `${provider.namespace}:event:instance-content:evt-occurrence-1:2026-08-01T00:00:00.000Z`,
      );
      expect(content.content?.body).toContain('Sprint planning');
      expect(content.containerRefs).toContain(`${provider.namespace}:event:evt-1`);
    });

    it('turns a cancelled instance into a cancelled transition', () => {
      const result = provider.normalize(
        makeEvent({ id: 'evt-occurrence-2', recurringEventId: 'evt-1', status: 'cancelled' }),
        'created',
      );
      const transition = result.facts.find((fact) => fact.kind === 'transition')!;

      expect(transition.transition?.transitionType).toBe('cancelled');
      expect(transition.containerRefs).toContain(`${provider.namespace}:event:evt-1`);
      expect(result.containers[0]!.sourceContainerId).toBe(`${provider.namespace}:event:evt-1`);
    });
  });
}

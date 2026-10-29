// SPDX-License-Identifier: Apache-2.0
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  areBrowserTelemetryPropertiesValid,
  BROWSER_SURFACES,
  CLIENT_ERROR_NAMES,
  clientErrorName,
  isBrowserEventAllowedFrom,
  isBrowserTelemetryProperty,
  isBrowserSourceKind,
  isBrowserTelemetryEvent,
  type BrowserCatalog,
  type BrowserSurface,
  type BrowserTelemetryEventName,
  type TelemetryEventMap,
} from '../src/events.js';

const CATALOG: BrowserCatalog = {
  routeTemplates: new Set(['/members', '/tenants/:id']),
  pages: new Set(['/', '/pricing', 'not_found']),
  ctas: new Set(['hero_get_started']),
};

it('keeps browser event properties closed and flat', () => {
  expectTypeOf<BrowserTelemetryEventName>().toEqualTypeOf<
    | 'source.connect_started'
    | 'source.connect_failed'
    | 'source.settings_viewed'
    | 'sign_in_completed'
    | 'client_error'
    | 'page_viewed'
    | 'cta_clicked'
    | 'route_viewed'
    | 'onboarding_step_viewed'
  >();
  expectTypeOf<TelemetryEventMap['source.connect_started']>().toEqualTypeOf<{
    eventSchemaVersion: 1;
    sourceKind:
      | 'github'
      | 'code'
      | 'slack'
      | 'linear'
      | 'notion'
      | 'jira'
      | 'intercom'
      | 'confluence'
      | 'google_drive'
      | 'gmail'
      | 'microsoft365'
      | 'microsoft365_mail'
      | 'google_calendar'
      | 'microsoft365_calendar';
  }>();
  expectTypeOf<TelemetryEventMap['sign_in_completed']>().toEqualTypeOf<Record<string, never>>();
  expectTypeOf<TelemetryEventMap['client_error']>().toEqualTypeOf<{
    origin: 'error_boundary' | 'window_error' | 'unhandled_rejection';
    errorName: (typeof CLIENT_ERROR_NAMES)[number];
  }>();

  // @ts-expect-error The browser catalog accepts no ad-hoc event names.
  const unknownEvent: BrowserTelemetryEventName = 'source.connected';
  const unknownProperty: TelemetryEventMap['source.connect_started'] = {
    eventSchemaVersion: 1,
    sourceKind: 'github',
    // @ts-expect-error Browser event properties cannot include arbitrary keys.
    title: 'customer content',
  };
  const nestedValue: TelemetryEventMap['source.connect_started'] = {
    eventSchemaVersion: 1,
    // @ts-expect-error Browser event values remain flat primitives.
    sourceKind: { id: 'github' },
  };
  const arbitraryReason: TelemetryEventMap['source.connect_failed'] = {
    eventSchemaVersion: 1,
    sourceKind: 'github',
    // @ts-expect-error Failure reasons are a closed union, never an arbitrary dependency string.
    reason: 'OAuth error: token abc123',
  };
  const arbitraryOrigin: TelemetryEventMap['client_error'] = {
    // @ts-expect-error Client error origins are a closed union.
    origin: 'renderer',
    errorName: 'TypeError',
  };
  expect([unknownEvent, unknownProperty, nestedValue, arbitraryReason]).toHaveLength(4);
  expect([arbitraryOrigin]).toHaveLength(1);
});

it('rejects inherited and unknown browser event names at runtime', () => {
  expect(isBrowserTelemetryEvent('toString')).toBe(false);
  expect(isBrowserTelemetryEvent('constructor')).toBe(false);
  expect(isBrowserTelemetryEvent('source.connected')).toBe(false);
});

it('accepts only source kinds in the browser egress catalog', () => {
  expect(isBrowserSourceKind('github')).toBe(true);
  expect(isBrowserSourceKind('meeting')).toBe(false);
  expect(isBrowserSourceKind('email')).toBe(false);
});

it('keeps client error properties content-free at runtime', () => {
  expect(isBrowserTelemetryProperty('client_error', 'origin', 'window_error')).toBe(true);
  expect(isBrowserTelemetryProperty('client_error', 'origin', 'renderer')).toBe(false);
  expect(isBrowserTelemetryProperty('client_error', 'errorName', 'TypeError')).toBe(true);
  expect(
    isBrowserTelemetryProperty('client_error', 'errorName', 'TypeError: customer content'),
  ).toBe(false);
  expect(isBrowserTelemetryProperty('client_error', 'errorName', '')).toBe(false);
  expect(isBrowserTelemetryProperty('client_error', 'origin', 'window_error')).toBe(true);
});

it('keeps empty browser events property-free at runtime', () => {
  expect(areBrowserTelemetryPropertiesValid('sign_in_completed', {})).toBe(true);
  expect(areBrowserTelemetryPropertiesValid('sign_in_completed', { provider: 'google' })).toBe(
    false,
  );
  expect(areBrowserTelemetryPropertiesValid('sign_in_completed', { eventSchemaVersion: 1 })).toBe(
    false,
  );
});

it('keeps the client error name list closed and aligned with the type', () => {
  expect(new Set(CLIENT_ERROR_NAMES).size).toBe(CLIENT_ERROR_NAMES.length);
  expect(CLIENT_ERROR_NAMES).toContain('other');
  expect(CLIENT_ERROR_NAMES).toContain('UnknownError');
});

describe('clientErrorName', () => {
  it('keeps the name of a listed Error', () => {
    expect(clientErrorName(new TypeError('customer content'))).toBe('TypeError');
    expect(clientErrorName(new DOMException('customer content', 'AbortError'))).toBe('AbortError');
  });

  it('maps a custom Error subclass to other', () => {
    expect(clientErrorName(new (class Foo extends Error {})())).toBe('other');
  });

  it('maps a custom subclass that reuses a listed name to other', () => {
    class NetworkError extends Error {}

    expect(clientErrorName(new NetworkError('customer content'))).toBe('other');
  });

  it('keeps a listed name assigned to a platform Error, as bundlers do for ChunkLoadError', () => {
    const chunk = new Error('Loading chunk 7 failed');
    chunk.name = 'ChunkLoadError';

    expect(clientErrorName(chunk)).toBe('ChunkLoadError');
  });

  it('maps an Error with a forged name to other', () => {
    const forged = new Error('x');
    forged.name = 'Project Zephyr';

    expect(clientErrorName(forged)).toBe('other');
  });

  it.each([
    ['a string', 'TypeError'],
    ['null', null],
    ['undefined', undefined],
    ['a plain object', { name: 'TypeError' }],
  ])('maps %s to other', (_case, value) => {
    expect(clientErrorName(value)).toBe('other');
  });

  it('survives a hostile name getter', () => {
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'name', {
      get() {
        throw new Error('customer content');
      },
    });

    expect(clientErrorName(hostile)).toBe('other');
  });
});

describe('isBrowserEventAllowedFrom', () => {
  const D8_TABLE: Record<BrowserTelemetryEventName, readonly BrowserSurface[]> = {
    page_viewed: ['web'],
    cta_clicked: ['web'],
    route_viewed: ['console', 'operator', 'box'],
    onboarding_step_viewed: ['console'],
    sign_in_completed: ['console', 'operator', 'box'],
    client_error: ['console', 'operator', 'box'],
    'source.connect_started': ['console', 'box'],
    'source.connect_failed': ['console', 'box'],
    'source.settings_viewed': ['console'],
  };

  it.each(
    Object.entries(D8_TABLE).flatMap(([event, allowed]) =>
      BROWSER_SURFACES.map((surface) => [event, surface, allowed.includes(surface)] as const),
    ),
  )('%s from %s is allowed: %s', (event, surface, expected) => {
    expect(isBrowserEventAllowedFrom(event as BrowserTelemetryEventName, surface)).toBe(expected);
  });

  it('refuses an unknown event and an unknown surface', () => {
    expect(isBrowserEventAllowedFrom('toString' as never, 'web')).toBe(false);
    expect(isBrowserEventAllowedFrom('page_viewed', 'toString' as never)).toBe(false);
  });
});

describe('catalog-backed browser events', () => {
  it('refuses page_viewed, cta_clicked, route_viewed and onboarding_step_viewed without a catalog', () => {
    expect(
      areBrowserTelemetryPropertiesValid('page_viewed', {
        eventSchemaVersion: 1,
        page: '/pricing',
      }),
    ).toBe(false);
    expect(
      areBrowserTelemetryPropertiesValid('cta_clicked', {
        eventSchemaVersion: 1,
        cta: 'hero_get_started',
        page: '/',
      }),
    ).toBe(false);
    expect(
      areBrowserTelemetryPropertiesValid('route_viewed', {
        eventSchemaVersion: 1,
        routeTemplate: '/members',
      }),
    ).toBe(false);
    expect(
      areBrowserTelemetryPropertiesValid('route_viewed', {
        eventSchemaVersion: 1,
        routeTemplate: 'unmatched',
      }),
    ).toBe(false);
    expect(
      areBrowserTelemetryPropertiesValid('onboarding_step_viewed', {
        eventSchemaVersion: 1,
        step: 'sources',
      }),
    ).toBe(false);
  });

  it('refuses the per-key check for catalog keys without a catalog', () => {
    expect(isBrowserTelemetryProperty('page_viewed', 'page', '/pricing')).toBe(false);
    expect(isBrowserTelemetryProperty('cta_clicked', 'cta', 'hero_get_started')).toBe(false);
    expect(isBrowserTelemetryProperty('route_viewed', 'routeTemplate', '/members')).toBe(false);
    expect(isBrowserTelemetryProperty('onboarding_step_viewed', 'step', 'sources')).toBe(false);
  });

  it('accepts members of the catalog', () => {
    expect(
      areBrowserTelemetryPropertiesValid(
        'page_viewed',
        { eventSchemaVersion: 1, page: 'not_found' },
        CATALOG,
      ),
    ).toBe(true);
    expect(
      areBrowserTelemetryPropertiesValid(
        'cta_clicked',
        { eventSchemaVersion: 1, cta: 'hero_get_started', page: '/' },
        CATALOG,
      ),
    ).toBe(true);
    expect(
      areBrowserTelemetryPropertiesValid(
        'route_viewed',
        { eventSchemaVersion: 1, routeTemplate: '/tenants/:id' },
        CATALOG,
      ),
    ).toBe(true);
    expect(
      areBrowserTelemetryPropertiesValid(
        'onboarding_step_viewed',
        { eventSchemaVersion: 1, step: 'invite' },
        CATALOG,
      ),
    ).toBe(true);
  });

  it('admits unmatched for route_viewed even when the catalog does not list it', () => {
    expect(
      areBrowserTelemetryPropertiesValid(
        'route_viewed',
        { eventSchemaVersion: 1, routeTemplate: 'unmatched' },
        CATALOG,
      ),
    ).toBe(true);
  });

  it.each([
    ['page_viewed', { eventSchemaVersion: 1, page: '/privacy' }],
    ['page_viewed', { eventSchemaVersion: 1, page: '/pricing?x=1' }],
    ['page_viewed', { eventSchemaVersion: 2, page: '/pricing' }],
    ['page_viewed', { eventSchemaVersion: 1, page: '/pricing', cta: 'hero_get_started' }],
    ['cta_clicked', { eventSchemaVersion: 1, cta: 'Hero', page: '/' }],
    ['cta_clicked', { eventSchemaVersion: 1, cta: 'hero_get_started', page: '/privacy' }],
    ['cta_clicked', { eventSchemaVersion: 1, cta: 'hero_get_started' }],
    ['route_viewed', { eventSchemaVersion: 1, routeTemplate: '/billing' }],
    ['route_viewed', { eventSchemaVersion: 1, routeTemplate: '/members', surface: 'console' }],
    ['route_viewed', { eventSchemaVersion: 1, routeTemplate: 7 }],
    ['route_viewed', { eventSchemaVersion: 1, page: '/pricing' }],
    ['onboarding_step_viewed', { eventSchemaVersion: 1, step: 'recovery' }],
    ['onboarding_step_viewed', { eventSchemaVersion: 1, step: 'Project Zephyr' }],
  ] as const)('refuses %s with %j', (event, properties) => {
    expect(areBrowserTelemetryPropertiesValid(event, properties, CATALOG)).toBe(false);
  });

  it('refuses a catalog key under the wrong event', () => {
    expect(isBrowserTelemetryProperty('route_viewed', 'page', '/pricing', CATALOG)).toBe(false);
    expect(isBrowserTelemetryProperty('page_viewed', 'cta', 'hero_get_started', CATALOG)).toBe(
      false,
    );
    expect(isBrowserTelemetryProperty('page_viewed', 'step', 'sources', CATALOG)).toBe(false);
  });

  it('keeps client_error and sign_in_completed catalog-independent', () => {
    expect(
      areBrowserTelemetryPropertiesValid('client_error', {
        origin: 'window_error',
        errorName: 'other',
      }),
    ).toBe(true);
    expect(
      areBrowserTelemetryPropertiesValid('client_error', {
        origin: 'window_error',
        errorName: 'MyCustomError',
      }),
    ).toBe(false);
    expect(areBrowserTelemetryPropertiesValid('sign_in_completed', {}, CATALOG)).toBe(true);
  });
});

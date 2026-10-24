// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DURATION_BUCKETS,
  REQUEST_METHODS,
  REQUEST_STATUS_CLASSES,
  UNMATCHED_ROUTE_TEMPLATE,
  durationBucket,
  isHttpStatus,
  isRouteTemplateShape,
  normalizeRequestObservation,
  requestMethod,
  statusClassOf,
  type RequestUsagePolicy,
} from '../src/request-usage.js';

const UUID_LITERAL = '3e083ed2-5b1a-4c6e-9f2d-7a8b9c0d1e2f';
const COUNT_EVERYTHING: RequestUsagePolicy = {
  classify: () => 'counted',
  suppressesDuration: () => false,
};

function observation(overrides: Partial<Parameters<typeof normalizeRequestObservation>[0]> = {}) {
  return {
    method: 'GET',
    routeTemplate: '/v1/orgs/:id/members',
    statusCode: 200,
    durationMs: 120,
    ...overrides,
  };
}

describe('closed vocabularies', () => {
  it('pins the closed lists', () => {
    expect(REQUEST_METHODS).toEqual([
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'HEAD',
      'OPTIONS',
      'OTHER',
    ]);
    expect(REQUEST_STATUS_CLASSES).toEqual(['1xx', '2xx', '3xx', '4xx', '5xx', 'unknown']);
    expect(DURATION_BUCKETS).toEqual([
      'lt_100ms',
      '100_500ms',
      '500ms_2s',
      '2_10s',
      'gte_10s',
      'not_recorded',
    ]);
    expect(UNMATCHED_ROUTE_TEMPLATE).toBe('unmatched');
  });
});

describe('requestMethod', () => {
  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])('keeps %s', (method) => {
    expect(requestMethod(method)).toBe(method);
  });

  it.each(['get', 'TRACE', 'PROPFIND', ''])('maps %j to OTHER', (method) => {
    expect(requestMethod(method)).toBe('OTHER');
  });
});

describe('statusClassOf', () => {
  it.each([
    [100, '1xx'],
    [204, '2xx'],
    [302, '3xx'],
    [404, '4xx'],
    [599, '5xx'],
    [99, 'unknown'],
    [600, 'unknown'],
    [Number.NaN, 'unknown'],
  ] as const)('classifies %s as %s', (status, expected) => {
    expect(statusClassOf(status)).toBe(expected);
  });
});

describe('durationBucket', () => {
  it.each([
    [0, 'lt_100ms'],
    [99, 'lt_100ms'],
    [100, '100_500ms'],
    [499, '100_500ms'],
    [500, '500ms_2s'],
    [1999, '500ms_2s'],
    [2000, '2_10s'],
    [9999, '2_10s'],
    [10000, 'gte_10s'],
  ] as const)('buckets %s ms as %s', (durationMs, expected) => {
    expect(durationBucket(durationMs)).toBe(expected);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'refuses %s',
    (durationMs) => {
      expect(durationBucket(durationMs)).toBeUndefined();
    },
  );
});

describe('isRouteTemplateShape', () => {
  it.each([
    '/v1/orgs/:id/members',
    '/v1/orgs/*',
    '/.well-known/jwks.json',
    '/',
    'unmatched',
    '/api/v1/unsubscribe/:token',
  ])('accepts %s', (value) => {
    expect(isRouteTemplateShape(value)).toBe(true);
  });

  it.each([
    ['a UUID segment', `/v1/orgs/${UUID_LITERAL}`],
    ['a long digit run', '/v1/x/12345'],
    ['a digit run inside a literal', '/v1/abc1234'],
    ['a hex run', '/v1/x/deadbeefcafe'],
    ['a UUID-prefixed literal', `/v1/a${UUID_LITERAL}`],
    ['an uppercase literal', '/v1/Leak'],
    ['a query string', '/a?b'],
    ['a fragment', '/a#b'],
    ['whitespace', '/a b'],
    ['an empty inner segment', '//a'],
    ['a trailing empty segment', '/a/'],
    ['161 characters', `/${'ab/'.repeat(52)}abcd`],
    ['a 41-character segment', `/${'z'.repeat(41)}`],
    ['a param starting with a digit', '/v1/:1a'],
    ['a missing leading slash', 'v1/x'],
    ['an empty string', ''],
    ['a number', 42],
    ['null', null],
  ])('rejects %s', (_case, value) => {
    expect(isRouteTemplateShape(value)).toBe(false);
  });

  it('accepts a 160-character template and a 40-character literal', () => {
    expect(isRouteTemplateShape(`/${'z'.repeat(40)}`)).toBe(true);
    expect(isRouteTemplateShape(`/${'ab/'.repeat(52)}abc`)).toBe(true);
  });
});

describe('isHttpStatus', () => {
  it.each([100, 200, 404, 599])('accepts %s', (status) => {
    expect(isHttpStatus(status)).toBe(true);
  });

  it.each([99, 600, 200.5, Number.NaN, '200', null, undefined])('rejects %s', (status) => {
    expect(isHttpStatus(status)).toBe(false);
  });
});

describe('normalizeRequestObservation', () => {
  it('drops a preflight whose template is unmatched', () => {
    expect(
      normalizeRequestObservation(
        observation({ method: 'OPTIONS', routeTemplate: UNMATCHED_ROUTE_TEMPLATE }),
        COUNT_EVERYTHING,
      ),
    ).toBeUndefined();
  });

  it('drops a preflight on a registered route even when the policy counts it', () => {
    expect(
      normalizeRequestObservation(observation({ method: 'OPTIONS' }), COUNT_EVERYTHING),
    ).toBeUndefined();
  });

  it('normalizes a counted observation', () => {
    expect(normalizeRequestObservation(observation(), COUNT_EVERYTHING)).toEqual({
      method: 'GET',
      routeTemplate: '/v1/orgs/:id/members',
      statusCode: 200,
      statusClass: '2xx',
      durationBucket: '100_500ms',
    });
  });

  it('keeps the raw unmatched template without consulting the policy', () => {
    const policy: RequestUsagePolicy = {
      classify: () => {
        throw new Error('unreachable');
      },
      suppressesDuration: () => false,
    };

    expect(
      normalizeRequestObservation(observation({ routeTemplate: UNMATCHED_ROUTE_TEMPLATE }), policy),
    ).toMatchObject({ routeTemplate: 'unmatched' });
  });

  it('drops an excluded route', () => {
    const policy: RequestUsagePolicy = { ...COUNT_EVERYTHING, classify: () => 'excluded' };

    expect(normalizeRequestObservation(observation(), policy)).toBeUndefined();
  });

  it('drops an unknown route instead of relabelling it as unmatched', () => {
    const policy: RequestUsagePolicy = { ...COUNT_EVERYTHING, classify: () => 'unknown' };

    expect(
      normalizeRequestObservation(
        observation({ method: 'POST', routeTemplate: '/api/v1/x/verdict' }),
        policy,
      ),
    ).toBeUndefined();
  });

  it('drops a counted route whose template has a bad shape', () => {
    expect(
      normalizeRequestObservation(
        observation({ routeTemplate: `/v1/orgs/${UUID_LITERAL}` }),
        COUNT_EVERYTHING,
      ),
    ).toBeUndefined();
  });

  it('drops when the policy throws', () => {
    const policy: RequestUsagePolicy = {
      classify: () => {
        throw new Error('policy bug');
      },
      suppressesDuration: () => false,
    };

    expect(normalizeRequestObservation(observation(), policy)).toBeUndefined();
  });

  it.each([99, 600, 200.5, Number.NaN])('drops status code %s', (statusCode) => {
    expect(
      normalizeRequestObservation(observation({ statusCode }), COUNT_EVERYTHING),
    ).toBeUndefined();
  });

  it.each([100, 599])('keeps the status boundary %s', (statusCode) => {
    expect(
      normalizeRequestObservation(observation({ statusCode }), COUNT_EVERYTHING),
    ).toMatchObject({ statusCode });
  });

  it('reports not_recorded when the policy suppresses duration, even for an invalid duration', () => {
    const policy: RequestUsagePolicy = { ...COUNT_EVERYTHING, suppressesDuration: () => true };

    expect(
      normalizeRequestObservation(observation({ durationMs: Number.NaN }), policy),
    ).toMatchObject({ durationBucket: 'not_recorded' });
  });

  it('drops an invalid duration when it is recorded', () => {
    expect(
      normalizeRequestObservation(observation({ durationMs: -1 }), COUNT_EVERYTHING),
    ).toBeUndefined();
  });

  it('maps an unrecognized method to OTHER before classifying', () => {
    const seen: string[] = [];
    const policy: RequestUsagePolicy = {
      ...COUNT_EVERYTHING,
      classify: (method) => {
        seen.push(method);
        return 'counted';
      },
    };

    normalizeRequestObservation(observation({ method: 'get' }), policy);

    expect(seen).toEqual(['OTHER']);
  });
});

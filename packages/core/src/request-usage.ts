// SPDX-License-Identifier: Apache-2.0
export const REQUEST_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'OTHER',
] as const;
export type RequestMethod = (typeof REQUEST_METHODS)[number];

export const REQUEST_STATUS_CLASSES = ['1xx', '2xx', '3xx', '4xx', '5xx', 'unknown'] as const;
export type RequestStatusClass = (typeof REQUEST_STATUS_CLASSES)[number];

export const DURATION_BUCKETS = [
  'lt_100ms',
  '100_500ms',
  '500ms_2s',
  '2_10s',
  'gte_10s',
  'not_recorded',
] as const;
export type DurationBucket = (typeof DURATION_BUCKETS)[number];

export const UNMATCHED_ROUTE_TEMPLATE = 'unmatched';

const KNOWN_METHODS: ReadonlySet<string> = new Set(
  REQUEST_METHODS.filter((method) => method !== 'OTHER'),
);
const STATUS_CLASS_BY_HUNDRED: Readonly<Record<number, RequestStatusClass>> = {
  1: '1xx',
  2: '2xx',
  3: '3xx',
  4: '4xx',
  5: '5xx',
};
export const MIN_HTTP_STATUS = 100;
export const MAX_HTTP_STATUS = 599;
const DURATION_BUCKET_UPPER_BOUNDS_MS = [
  [100, 'lt_100ms'],
  [500, '100_500ms'],
  [2_000, '500ms_2s'],
  [10_000, '2_10s'],
] as const;
const PREFLIGHT_METHOD: RequestMethod = 'OPTIONS';
const MAX_ROUTE_TEMPLATE_LENGTH = 160;
const LITERAL_SEGMENT = /^\.?[a-z][a-z0-9._-]{0,39}$/;
const PARAM_SEGMENT = /^:[A-Za-z][A-Za-z0-9]{0,31}$/;
const WILDCARD_SEGMENT = '*';
const DIGIT_RUN = /\d{4,}/;
const UUID_PREFIX = /[0-9a-f]{8}-[0-9a-f]{4}/;
const HEX_RUN = /^[0-9a-f]{12,}$/;

export function requestMethod(method: string): RequestMethod {
  return KNOWN_METHODS.has(method) ? (method as RequestMethod) : 'OTHER';
}

export function statusClassOf(status: number): RequestStatusClass {
  return STATUS_CLASS_BY_HUNDRED[Math.floor(status / 100)] ?? 'unknown';
}

export function durationBucket(
  durationMs: number,
): Exclude<DurationBucket, 'not_recorded'> | undefined {
  if (!Number.isFinite(durationMs) || durationMs < 0) return undefined;
  for (const [upperBound, bucket] of DURATION_BUCKET_UPPER_BOUNDS_MS) {
    if (durationMs < upperBound) return bucket;
  }
  return 'gte_10s';
}

export function isHttpStatus(status: unknown): status is number {
  return (
    typeof status === 'number' &&
    Number.isInteger(status) &&
    status >= MIN_HTTP_STATUS &&
    status <= MAX_HTTP_STATUS
  );
}

export function isRouteTemplateShape(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value === UNMATCHED_ROUTE_TEMPLATE || value === '/') return true;
  if (value.length > MAX_ROUTE_TEMPLATE_LENGTH || !value.startsWith('/')) return false;
  return value.slice(1).split('/').every(isTemplateSegment);
}

function isTemplateSegment(segment: string): boolean {
  if (segment === WILDCARD_SEGMENT) return true;
  if (PARAM_SEGMENT.test(segment)) return true;
  return LITERAL_SEGMENT.test(segment) && !looksLikeIdentifier(segment);
}

function looksLikeIdentifier(literal: string): boolean {
  return DIGIT_RUN.test(literal) || UUID_PREFIX.test(literal) || HEX_RUN.test(literal);
}

export type RouteClassification = 'counted' | 'excluded' | 'unknown';

export interface RequestUsagePolicy {
  classify(method: RequestMethod, rawTemplate: string): RouteClassification;
  suppressesDuration(method: RequestMethod, routeTemplate: string): boolean;
}

export interface RequestObservationInput {
  method: string;
  routeTemplate: string;
  statusCode: number;
  durationMs: number;
}

export interface NormalizedRequestUsage {
  method: RequestMethod;
  routeTemplate: string;
  statusCode: number;
  statusClass: RequestStatusClass;
  durationBucket: DurationBucket;
}

// not yet wired (A1a/A1b/A4): no caller reaches the normalizer until the request sink lands.
export function normalizeRequestObservation(
  input: RequestObservationInput,
  policy: RequestUsagePolicy,
): NormalizedRequestUsage | undefined {
  try {
    return normalizeUnchecked(input, policy);
  } catch {
    return undefined;
  }
}

function normalizeUnchecked(
  input: RequestObservationInput,
  policy: RequestUsagePolicy,
): NormalizedRequestUsage | undefined {
  const method = requestMethod(input.method);
  if (method === PREFLIGHT_METHOD) return undefined;
  const routeTemplate = countedTemplate(method, input.routeTemplate, policy);
  if (routeTemplate === undefined || !isHttpStatus(input.statusCode)) return undefined;
  const bucket = policy.suppressesDuration(method, routeTemplate)
    ? 'not_recorded'
    : durationBucket(input.durationMs);
  if (bucket === undefined) return undefined;
  return {
    method,
    routeTemplate,
    statusCode: input.statusCode,
    statusClass: statusClassOf(input.statusCode),
    durationBucket: bucket,
  };
}

function countedTemplate(
  method: RequestMethod,
  rawTemplate: string,
  policy: RequestUsagePolicy,
): string | undefined {
  if (rawTemplate === UNMATCHED_ROUTE_TEMPLATE) return rawTemplate;
  if (policy.classify(method, rawTemplate) !== 'counted') return undefined;
  return isRouteTemplateShape(rawTemplate) ? rawTemplate : undefined;
}

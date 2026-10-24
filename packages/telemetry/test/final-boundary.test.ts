// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import type { ErrorReport } from '@folklore/errors';
import { areServerTelemetryPropertiesValid } from '../src/server-event-properties.js';
import {
  BrowserTelemetryEvent,
  CATALOG_BACKED_BROWSER_EVENTS,
  CLIENT_ERROR_NAMES,
  TelemetryEvent,
  type BrowserTelemetryEventName,
  type TelemetryEventMap,
} from '../src/events.js';
import { PostHogTelemetryClient } from '../src/PostHogTelemetryClient.js';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const ERROR_REPORT: ErrorReport = {
  error_type: 'internal_error',
  error_name: 'InternalError',
  category: 'internal',
  http_status: 500,
  operational: false,
  component: 'worker',
  origin: 'uncaught',
  fingerprint: '532394622c922789',
};

const VALID_SERVER_EVENT_FIXTURES = {
  'org.created': {
    orgId: ORGANIZATION_ID,
    plan: 'trial',
    region: 'us-east-1',
    tier: 'shared',
    processingTier: 'shared',
  },
  'org.recovery_key_set': { orgId: ORGANIZATION_ID, rotated: false },
  'co_processing_consent.recorded': {
    orgId: ORGANIZATION_ID,
    tier: 'shared',
    disclosureVersion: '2026-07-13',
  },
  'marketing_opt_in.record_failed': {},
  'source.connected': { orgId: ORGANIZATION_ID, sourceKind: 'github', hasRefreshToken: false },
  'source.routing_conflict': {
    orgId: ORGANIZATION_ID,
    sourceKind: 'github',
    rejectedBy: 'postgres_upsert',
  },
  'member.invited': { orgId: ORGANIZATION_ID, role: 'member', count: 1 },
  'member.invites_revoked': {
    orgId: ORGANIZATION_ID,
    count: 1,
    cause: 'inviter_no_longer_permitted',
  },
  'beta_invite.created': {},
  'beta_invite.accepted': { betaInviteId: ORGANIZATION_ID },
  'directory.imported': {
    orgId: ORGANIZATION_ID,
    provider: 'merge',
    peopleCount: 1,
    groupCount: 1,
  },
  'subscription.created': { orgId: ORGANIZATION_ID, status: 'trialing' },
  'subscription.status_changed': { orgId: ORGANIZATION_ID, status: 'active' },
  'subscription.seats_changed': { orgId: ORGANIZATION_ID, seats: 1 },
  'wiki.viewed': {
    orgId: ORGANIZATION_ID,
    audience: 'all-members',
    blockCount: 1,
  },
  'review.actioned': { orgId: ORGANIZATION_ID, action: 'assign' },
  'review.snippets_degraded': { orgId: ORGANIZATION_ID },
  'fact.ingested': { orgId: ORGANIZATION_ID, sourceKind: 'github' },
  'fact.scored': { orgId: ORGANIZATION_ID, confidence: 'high', hnswExpanded: false },
  'fact.promoted': { orgId: ORGANIZATION_ID, containerId: ORGANIZATION_ID },
  'association.drain.run': { count: 1, durationMs: 1 },
  'association.judged': { orgId: ORGANIZATION_ID, assigned: 1, removed: 1, recorded: 1 },
  'theme.resolved': { orgId: ORGANIZATION_ID, fallback: false },
  'theme.inference': { orgId: ORGANIZATION_ID, fallback: false },
  'theme.graph_edge_failed': { orgId: ORGANIZATION_ID, kind: 'fact_theme' },
  'theme.merged': { orgId: ORGANIZATION_ID, trigger: 'auto' },
  'theme.merge_reviewed': { orgId: ORGANIZATION_ID, action: 'approve' },
  'theme.merge_graph_failed': { orgId: ORGANIZATION_ID },
  'theme.merge_reconcile_failed': { orgId: ORGANIZATION_ID },
  'theme.merge_reconcile_unresolved': { orgId: ORGANIZATION_ID },
  'inference.embed': { model: 'qwen/qwen3-embedding-8b', latencyMs: 1 },
  'inference.generate': {
    model: 'z-ai/glm-5.2',
    latencyMs: 1,
    inputTokens: 1,
    outputTokens: 1,
  },
  'inference.receipt_verified': { sessionId: ORGANIZATION_ID },
  'enclave.event_loop_delay': {
    loopDelayP50Ms: 1,
    loopDelayP99Ms: 400,
    loopDelayMaxMs: 1100,
    loopSamples: 50,
    seconds: 60,
  },
  'inference.model_rejected': { model: 'deepseek-v4-pro' },
  'inference.attestation_failed': { reason: 'response carried no receipt id' },
  'inference.error': { model: 'z-ai/glm-5.2', errorType: 'generate_failed' },
  'inference.receipt_verification_staged_off': { mode: 'commissioning' },
  'wiki.synthesized': { orgId: ORGANIZATION_ID, themeId: ORGANIZATION_ID },
  'wiki.rich_blocks.synthesized': {
    orgId: ORGANIZATION_ID,
    themeId: ORGANIZATION_ID,
    diagramSeen: 1,
    diagramEmitted: 1,
    diagramDropped: 0,
    graphSeen: 1,
    graphEmitted: 1,
    graphDropped: 0,
    graphRepaired: 0,
    chartSeen: 1,
    chartEmitted: 1,
    chartDropped: 0,
    chartRepaired: 0,
    codeSeen: 1,
    codeEmitted: 1,
    codeDropped: 0,
    embedSeen: 1,
    embedEmitted: 1,
    embedDropped: 0,
    canvasSeen: 1,
    canvasEmitted: 1,
    canvasDropped: 0,
  },
  'wiki.critique.completed': {
    orgId: ORGANIZATION_ID,
    themeId: ORGANIZATION_ID,
    outcome: 'clean',
    issueCount: 0,
    visualIssueCount: 0,
    coverageOutcome: 'clean',
  },
  'wiki.link_preview': { orgId: ORGANIZATION_ID, outcome: 'preview', latencyMs: 1 },
  'notification.sent': { orgId: ORGANIZATION_ID, channel: 'email' },
  'notification.send_failed': {
    orgId: ORGANIZATION_ID,
    channel: 'email',
    errorType: 'provider_error',
  },
  'worker.error': { component: 'worker', errorType: 'internal_error', orgId: ORGANIZATION_ID },
  'deployment.checkin': {
    deploymentId: ORGANIZATION_ID,
    seatCount: 1,
    queueDepth: 0,
    linkedAccountCount: 0,
  },
  'org.usage': {
    deploymentId: ORGANIZATION_ID,
    orgId: ORGANIZATION_ID,
    factCount: 1,
    internalIdentityCount: 1,
    hnswElements: 1,
    themeCount: 1,
    resynthesizedRecent: 1,
    factsRecent: 1,
    activeSourceCount: 1,
  },
  'tenant.data_deleted': {
    deploymentId: ORGANIZATION_ID,
    orgId: ORGANIZATION_ID,
    objectsDeleted: 1,
    kmsShredScheduled: true,
  },
  'workspace.deleted': { orgId: ORGANIZATION_ID, deploymentsDeleted: 1 },
  'account.deleted': {
    accountId: ORGANIZATION_ID,
    workspacesDeleted: 1,
    platformTenantsRetained: 1,
    tombstoned: false,
  },
  'error.captured': ERROR_REPORT,
  'api.request': {
    method: 'GET',
    routeTemplate: '/v1/orgs/:id/members',
    statusCode: 200,
    durationBucket: 'lt_100ms',
  },
} satisfies { [K in (typeof TelemetryEvent)[keyof typeof TelemetryEvent]]: TelemetryEventMap[K] };

const VALID_RELAYED_EVENT_FIXTURES = {
  'source.connect_started': { eventSchemaVersion: 1, sourceKind: 'github' },
  'source.connect_failed': { eventSchemaVersion: 1, sourceKind: 'github', reason: 'network' },
  sign_in_completed: {},
  client_error: { origin: 'error_boundary', errorName: 'TypeError' },
  page_viewed: { eventSchemaVersion: 1, page: '/pricing' },
  cta_clicked: { eventSchemaVersion: 1, cta: 'hero_get_started', page: '/' },
  route_viewed: { eventSchemaVersion: 1, surface: 'console', routeTemplate: '/members' },
  onboarding_step_viewed: { eventSchemaVersion: 1, step: 'sources' },
} satisfies { [K in BrowserTelemetryEventName]: TelemetryEventMap[K] };

interface CaptureStub {
  captured: unknown[];
  capture(args: unknown): void;
  shutdown(): Promise<void>;
}

function recordingClient(): { client: PostHogTelemetryClient; captured: unknown[] } {
  const client = new PostHogTelemetryClient('phc_test_key_offline');
  const captured: unknown[] = [];
  const stub: CaptureStub = {
    captured,
    capture: (args) => captured.push(args),
    shutdown: async () => {},
  };
  (client as unknown as { client: CaptureStub }).client = stub;
  return { client, captured };
}

describe('PostHogTelemetryClient final boundary', () => {
  it('rejects an event name outside the runtime catalog', () => {
    const { client, captured } = recordingClient();

    client.track('customer.secret' as never, ORGANIZATION_ID, {} as never);

    expect(captured).toEqual([]);
  });

  it('accepts every event name in the server runtime catalog', () => {
    const { client, captured } = recordingClient();

    for (const event of Object.values(TelemetryEvent)) {
      client.track(event, ORGANIZATION_ID, VALID_SERVER_EVENT_FIXTURES[event]);
    }

    expect(captured).toHaveLength(Object.values(TelemetryEvent).length);
  });

  const catalogFreeEvents = Object.values(BrowserTelemetryEvent).filter(
    (event) => !CATALOG_BACKED_BROWSER_EVENTS.has(event),
  );
  const catalogBackedEvents = Object.values(BrowserTelemetryEvent).filter((event) =>
    CATALOG_BACKED_BROWSER_EVENTS.has(event),
  );

  it('accepts every relayed browser event name that needs no catalog', () => {
    const { client, captured } = recordingClient();

    for (const event of catalogFreeEvents) {
      client.track(event, ORGANIZATION_ID, VALID_RELAYED_EVENT_FIXTURES[event]);
    }

    expect(captured).toHaveLength(catalogFreeEvents.length);
  });

  it('keeps the catalog-backed names exactly the four the browser contract gates', () => {
    expect([...catalogBackedEvents].sort()).toEqual([
      'cta_clicked',
      'onboarding_step_viewed',
      'page_viewed',
      'route_viewed',
    ]);
  });

  it.each(['page_viewed', 'cta_clicked', 'route_viewed', 'onboarding_step_viewed'] as const)(
    'refuses a valid %s because no catalog-taking relay exists yet',
    (event) => {
      const { client, captured } = recordingClient();

      client.track(event, ORGANIZATION_ID, VALID_RELAYED_EVENT_FIXTURES[event] as never);

      expect(captured).toEqual([]);
      expect(areServerTelemetryPropertiesValid(event, VALID_RELAYED_EVENT_FIXTURES[event])).toBe(
        true,
      );
    },
  );

  it.each([
    ['a string status code', { statusCode: '200' }],
    ['an extra statusClass key', { statusClass: '2xx' }],
    ['a path key', { path: '/v1/orgs' }],
    ['a lowercase method', { method: 'get' }],
    ['status 99', { statusCode: 99 }],
    ['status 600', { statusCode: 600 }],
    ['a fractional status', { statusCode: 200.5 }],
    ['an unknown duration bucket', { durationBucket: '1s' }],
    ['a UUID in the route template', { routeTemplate: `/v1/orgs/${ORGANIZATION_ID}` }],
    ['a query string in the route template', { routeTemplate: '/v1/orgs?x=1' }],
    ['a non-string route template', { routeTemplate: 42 }],
  ])('rejects an api.request payload with %s', (_case, mutation) => {
    const { client, captured } = recordingClient();

    client.track('api.request', 'system', {
      ...VALID_SERVER_EVENT_FIXTURES['api.request'],
      ...mutation,
    } as never);

    expect(captured).toEqual([]);
  });

  it('accepts the unmatched and not_recorded api.request values', () => {
    const { client, captured } = recordingClient();

    client.track('api.request', 'system', {
      ...VALID_SERVER_EVENT_FIXTURES['api.request'],
      routeTemplate: 'unmatched',
      durationBucket: 'not_recorded',
    });

    expect(captured).toHaveLength(1);
  });

  it.each([
    ['page_viewed', { page: '/pricing?x' }],
    ['page_viewed', { page: '/Pricing' }],
    ['page_viewed', { page: '/pricing/extra' }],
    ['page_viewed', { eventSchemaVersion: 2 }],
    ['page_viewed', { path: '/pricing' }],
    ['cta_clicked', { cta: 'Hero' }],
    ['cta_clicked', { cta: 'hero get started' }],
    ['cta_clicked', { page: 'https://evil.example/' }],
    ['route_viewed', { surface: 'web' }],
    ['route_viewed', { surface: 'staff' }],
    ['route_viewed', { routeTemplate: `/tenants/${ORGANIZATION_ID}` }],
    ['route_viewed', { title: 'Project Zephyr' }],
    ['onboarding_step_viewed', { step: 'recovery' }],
    ['onboarding_step_viewed', { step: 'Project Zephyr' }],
    ['sign_in_completed', { provider: 'google' }],
    ['client_error', { errorName: 'MyCustomError' }],
    ['client_error', { errorName: 'TypeError: customer content' }],
    ['client_error', { origin: 'renderer' }],
    ['source.connect_started', { sourceKind: 'meeting' }],
    ['source.connect_failed', { reason: 'OAuth error: token abc123' }],
  ] as const)('rejects a relayed %s payload with %j', (event, mutation) => {
    const { client, captured } = recordingClient();

    client.track(event, 'system', { ...VALID_RELAYED_EVENT_FIXTURES[event], ...mutation } as never);

    expect(captured).toEqual([]);
  });

  it.each(CLIENT_ERROR_NAMES)('accepts the client error name %s', (errorName) => {
    const { client, captured } = recordingClient();

    client.track('client_error', ORGANIZATION_ID, { origin: 'window_error', errorName });

    expect(captured).toHaveLength(1);
  });

  it('rejects a wiki.viewed payload carrying a themeId', () => {
    const { client, captured } = recordingClient();

    client.track('wiki.viewed', ORGANIZATION_ID, {
      ...VALID_SERVER_EVENT_FIXTURES['wiki.viewed'],
      themeId: ORGANIZATION_ID,
    } as never);

    expect(captured).toEqual([]);
  });

  it.each([
    ['missing key', { orgId: ORGANIZATION_ID }],
    ['extra key', { orgId: ORGANIZATION_ID, sourceKind: 'github', customerText: 'Project Zephyr' }],
    ['wrong primitive type', { orgId: ORGANIZATION_ID, sourceKind: 7 }],
  ])('rejects a fact.ingested payload with a %s', (_case, properties) => {
    const { client, captured } = recordingClient();

    client.track('fact.ingested', ORGANIZATION_ID, properties as never);

    expect(captured).toEqual([]);
  });

  it.each([
    ['a missing count', { orgId: ORGANIZATION_ID, assigned: 1, removed: 1 }],
    [
      'an extra key',
      { orgId: ORGANIZATION_ID, assigned: 1, removed: 1, recorded: 1, containerLabel: 'x' },
    ],
    ['a negative count', { orgId: ORGANIZATION_ID, assigned: -1, removed: 0, recorded: 0 }],
    ['a non-numeric count', { orgId: ORGANIZATION_ID, assigned: '1', removed: 0, recorded: 0 }],
  ])('rejects an association.judged payload with %s', (_case, properties) => {
    const { client, captured } = recordingClient();

    client.track('association.judged', ORGANIZATION_ID, properties as never);

    expect(captured).toEqual([]);
  });

  it.each(['admin', 'member', 'custom'])('accepts a member.invited preset label: %s', (role) => {
    const { client, captured } = recordingClient();

    client.track('member.invited', ORGANIZATION_ID, { orgId: ORGANIZATION_ID, role, count: 1 });

    expect(captured).toHaveLength(1);
  });

  it.each([
    ['an owner role', { orgId: ORGANIZATION_ID, role: 'owner', count: 1 }],
    ['an extra key', { orgId: ORGANIZATION_ID, role: 'member', count: 1, email: 'a@b.c' }],
  ])('rejects a member.invited payload with %s', (_case, properties) => {
    const { client, captured } = recordingClient();

    client.track('member.invited', ORGANIZATION_ID, properties as never);

    expect(captured).toEqual([]);
  });

  it.each([
    'member_suspended',
    'invite_permission_removed',
    'inviter_no_longer_permitted',
    'inviter_cannot_readmit',
  ])('accepts a member.invites_revoked cause: %s', (cause) => {
    const { client, captured } = recordingClient();

    client.track('member.invites_revoked', ORGANIZATION_ID, {
      orgId: ORGANIZATION_ID,
      count: 2,
      cause: cause as never,
    });

    expect(captured).toHaveLength(1);
  });

  it.each([
    ['an unknown cause', { orgId: ORGANIZATION_ID, count: 1, cause: 'Project Zephyr' }],
    [
      'an extra key',
      {
        orgId: ORGANIZATION_ID,
        count: 1,
        cause: 'member_suspended',
        inviteeEmail: 'dana@acme.com',
      },
    ],
    ['a missing count', { orgId: ORGANIZATION_ID, cause: 'member_suspended' }],
  ])('rejects a member.invites_revoked payload with %s', (_case, properties) => {
    const { client, captured } = recordingClient();

    client.track('member.invites_revoked', ORGANIZATION_ID, properties as never);

    expect(captured).toEqual([]);
  });

  it('accepts the numeric ACI session identifier emitted by the receipt verifier', () => {
    const { client, captured } = recordingClient();

    client.track('inference.receipt_verified', 'system', { sessionId: 'sess-42' });

    expect(captured).toHaveLength(1);
  });

  it('accepts the judge and critique model moonshotai/kimi-k3 on an inference error', () => {
    const { client, captured } = recordingClient();

    client.track('inference.error', 'system', {
      model: 'moonshotai/kimi-k3',
      errorType: 'structured_failed',
    });

    expect(captured).toHaveLength(1);
  });

  it.each(['z-ai/glm-5.1', 'moonshotai/kimi-k2.6'])(
    'accepts the capacity-tier model %s on an inference error',
    (model) => {
      const { client, captured } = recordingClient();

      client.track('inference.error', 'system', { model, errorType: 'generate_failed' });

      expect(captured).toHaveLength(1);
    },
  );

  it('rejects an ACI session identifier that could carry prose', () => {
    const { client, captured } = recordingClient();

    client.track('inference.receipt_verified', 'system', {
      sessionId: 'sess-Project-Zephyr',
    });

    expect(captured).toEqual([]);
  });

  it.each([
    'attestation fetch returned 503',
    'receipt fetch returned 404',
    'upstream not verified (result=failed)',
  ])('accepts a bounded attestation failure reason: %s', (reason) => {
    const { client, captured } = recordingClient();

    client.track('inference.attestation_failed', 'system', { reason });

    expect(captured).toHaveLength(1);
  });

  it.each([
    'attestation fetch returned 503 Project Zephyr',
    'upstream not verified (result=Project Zephyr)',
  ])('rejects an attestation reason that can carry prose: %s', (reason) => {
    const { client, captured } = recordingClient();

    client.track('inference.attestation_failed', 'system', { reason });

    expect(captured).toEqual([]);
  });

  it.each([NaN, Infinity, -Infinity])('rejects a non-finite numeric property: %s', (count) => {
    const { client, captured } = recordingClient();

    client.track('association.drain.run', 'system', { count, durationMs: 1 });

    expect(captured).toEqual([]);
  });

  it.each([
    ['fact.ingested', { orgId: ORGANIZATION_ID, sourceKind: 'customer Project Zephyr' }],
    ['inference.embed', { model: 'customer Project Zephyr', latencyMs: 1 }],
    ['inference.model_rejected', { model: 'customer Project Zephyr' }],
    ['inference.error', { model: 'z-ai/glm-5.2', errorType: 'customer Project Zephyr' }],
    ['subscription.created', { orgId: ORGANIZATION_ID, status: 'customer Project Zephyr' }],
  ] as const)('rejects hostile caller text under an allowed key for %s', (event, properties) => {
    const { client, captured } = recordingClient();

    client.track(event, ORGANIZATION_ID, properties as never);

    expect(captured).toEqual([]);
  });

  it('rejects a non-string distinct ID without reading hostile properties', () => {
    const { client, captured } = recordingClient();
    let reads = 0;
    const distinctId = new Proxy(
      {},
      {
        get() {
          reads += 1;
          throw new Error('customer content');
        },
      },
    );

    expect(() =>
      client.track('fact.ingested', distinctId as never, {
        orgId: ORGANIZATION_ID,
        sourceKind: 'github',
      }),
    ).not.toThrow();
    expect(reads).toBe(0);
    expect(captured).toEqual([]);
  });

  it('rejects arbitrary short strings as distinct IDs', () => {
    const { client, captured } = recordingClient();

    client.track('fact.ingested', 'customer-secret', {
      orgId: ORGANIZATION_ID,
      sourceKind: 'github',
    });

    expect(captured).toEqual([]);
  });

  it.each(['/api/v1/wiki/customer-secret', '/health', 'unmatched'])(
    'rejects error reports carrying a non-parameterized route: %s',
    (route) => {
      const { client, captured } = recordingClient();

      client.captureError({ ...ERROR_REPORT, route });

      expect(captured).toEqual([]);
    },
  );

  it('accepts an error report carrying a parameterized route template', () => {
    const { client, captured } = recordingClient();

    client.captureError({ ...ERROR_REPORT, route: '/api/v1/wiki/:themeId' });

    expect(captured).toHaveLength(1);
  });

  it('rejects a forged error classification tuple', () => {
    const { client, captured } = recordingClient();

    client.captureError({
      ...ERROR_REPORT,
      error_type: 'customer_secret',
      error_name: 'CustomerSecretError',
    });

    expect(captured).toEqual([]);
  });

  it('rejects an arbitrary error fingerprint at the transport boundary', () => {
    const { client, captured } = recordingClient();

    client.captureError({ ...ERROR_REPORT, fingerprint: '5a455553504c414e' });

    expect(captured).toEqual([]);
  });

  it.each([
    ['fact.ingested', ORGANIZATION_ID, { orgId: ORGANIZATION_ID, sourceKind: 'github' }],
    [
      'deployment.checkin',
      ORGANIZATION_ID,
      {
        deploymentId: ORGANIZATION_ID,
        seatCount: 1,
        queueDepth: 0,
        linkedAccountCount: 0,
      },
    ],
    ['beta_invite.created', ORGANIZATION_ID, {}],
    ['beta_invite.accepted', ORGANIZATION_ID, { betaInviteId: ORGANIZATION_ID }],
    ['inference.embed', 'system', { model: 'qwen/qwen3-embedding-8b', latencyMs: 1 }],
  ] as const)('accepts the approved identity for %s', (event, distinctId, properties) => {
    const { client, captured } = recordingClient();

    client.track(event, distinctId, properties);

    expect(captured).toHaveLength(1);
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET,
  knowledgeNeighborhoodSchema,
  processedFactSchema,
  pullCompleteSignalSchema,
  pullDueMessageSchema,
  oauthDisconnectCleanupCommandSchema,
  synthesisQueueRequestSchema,
  synthesisRequestSchema,
  teamOnboardingSynthesisRequestSchema,
  teamOnboardingSynthesisResultSchema,
  themeSynthesisRequestSchema,
  themeSynthesisResultSchema,
  wikiArticleSchema,
  webhookLifecycleClaimSchema,
  webhookLifecycleCleanupClearSchema,
  webhookLifecycleDeliverySchema,
  webhookLifecycleFinalizeSchema,
  webhookProtocolCaptureSchema,
  wikiSynthesisResultSchema,
  type KnowledgeSkeleton,
  type PullCompleteSignal,
  type PullDueMessage,
  type SynthesisRequest,
  type ThemeSynthesisRequest,
  type WikiSynthesisResult,
} from '../src/enclave.js';

const RUNTIME_DEPLOYMENT_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_DEPLOYMENT_ID = '22222222-2222-4222-8222-222222222222';
const ORG_ID = '33333333-3333-4333-8333-333333333333';
const CONNECTION_ID = '44444444-4444-4444-8444-444444444444';
const ROUTE_ID = '55555555-5555-4555-8555-555555555555';
const CLAIM_ID = '66666666-6666-4666-8666-666666666666';

const webhookBinding = {
  runtimeDeploymentId: RUNTIME_DEPLOYMENT_ID,
  tenantDeploymentId: TENANT_DEPLOYMENT_ID,
  orgId: ORG_ID,
  connectionId: CONNECTION_ID,
  webhookRouteId: ROUTE_ID,
  sourceKind: 'jira',
  attestationGeneration: 'gen-1',
};

describe('webhook lifecycle enclave contracts', () => {
  const validFinalize = {
    ...webhookBinding,
    claimId: CLAIM_ID,
    revision: 4,
    registrationIds: ['1000'],
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    attemptedAt: '2026-08-10T12:00:00.000Z',
    succeededAt: '2026-08-10T12:00:00.000Z',
    status: 'registered' as const,
    operation: 'register' as const,
    failureCode: null,
  };

  it('accepts a fully bound registered finalization', () => {
    expect(webhookLifecycleFinalizeSchema.parse(validFinalize)).toEqual(validFinalize);
  });

  it('rejects malformed ids, unknown fields, oversized registrations, and inconsistent outcomes', () => {
    expect(() =>
      webhookLifecycleClaimSchema.parse({ ...webhookBinding, expectedRevision: -1 }),
    ).toThrow();
    expect(() =>
      webhookLifecycleClaimSchema.parse({
        ...webhookBinding,
        runtimeDeploymentId: 'runtime-1',
        expectedRevision: 0,
      }),
    ).toThrow();
    expect(() =>
      webhookLifecycleFinalizeSchema.parse({
        ...validFinalize,
        registrationIds: Array.from({ length: 17 }, (_, index) => String(index)),
      }),
    ).toThrow();
    expect(() =>
      webhookLifecycleFinalizeSchema.parse({
        ...validFinalize,
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
      }),
    ).toThrow();
    expect(() =>
      webhookLifecycleFinalizeSchema.parse({ ...validFinalize, failureCode: 'provider_error' }),
    ).toThrow();
    expect(() =>
      webhookLifecycleFinalizeSchema.parse({
        ...validFinalize,
        status: 'degraded',
        failureCode: null,
      }),
    ).toThrow();
    expect(() => webhookLifecycleFinalizeSchema.parse({ ...validFinalize, extra: true })).toThrow();
  });

  it('permits a degraded update with no active provider registration but rejects invalid bindings', () => {
    const degraded = webhookLifecycleFinalizeSchema.parse({
      ...validFinalize,
      registrationIds: null,
      expiresAt: null,
      succeededAt: null,
      status: 'degraded',
      failureCode: 'provider_error',
    });
    expect(degraded.status).toBe('degraded');
    expect(() =>
      webhookLifecycleFinalizeSchema.parse({ ...validFinalize, registrationIds: ['0001'] }),
    ).toThrow();
    expect(() =>
      webhookLifecycleFinalizeSchema.parse({
        ...validFinalize,
        registrationIds: ['9007199254740992'],
      }),
    ).toThrow();
    expect(() =>
      webhookLifecycleCleanupClearSchema.parse({
        ...webhookBinding,
        claimId: CLAIM_ID,
        revision: 4,
        orgId: 'not-a-uuid',
      }),
    ).toThrow();
    expect(() =>
      webhookLifecycleDeliverySchema.parse({
        ...webhookBinding,
        registrationId: '1000',
        attestationGeneration: '',
      }),
    ).toThrow();
  });

  it('accepts only bounded, value-free protocol capture metadata', () => {
    const capture = webhookProtocolCaptureSchema.parse({
      ...webhookBinding,
      capture: {
        algorithm: 'HS256',
        claims: [
          { name: 'aud', type: 'array' },
          { name: 'exp', type: 'number' },
          { name: 'iss', type: 'string' },
        ],
        lifetimeSeconds: 300,
        qshPresent: true,
        qshMatches: true,
        issuerPolicyMatch: 'matched',
        audiencePolicyMatch: 'matched',
        tenantPolicyMatch: 'matched',
      },
    });
    expect(capture.capture.algorithm).toBe('HS256');
    expect(() =>
      webhookProtocolCaptureSchema.parse({
        ...capture,
        capture: { ...capture.capture, claims: [{ name: 'authorization', type: 'string' }] },
      }),
    ).toThrow();
    expect(() =>
      webhookProtocolCaptureSchema.parse({
        ...capture,
        capture: { ...capture.capture, rawJwt: 'Bearer opaque-token' },
      }),
    ).toThrow();
    expect(() =>
      webhookProtocolCaptureSchema.parse({
        ...capture,
        capture: { ...capture.capture, algorithm: 'Bearer' },
      }),
    ).toThrow();
  });

  it('keeps the disconnect cleanup command content-free and fully bound', () => {
    expect(
      oauthDisconnectCleanupCommandSchema.parse({
        orgId: ORG_ID,
        tenantDeploymentId: TENANT_DEPLOYMENT_ID,
        connectionId: CONNECTION_ID,
        kind: 'jira',
        routeId: ROUTE_ID,
        generation: 'gen-1',
        disconnectEraseAfter: '2026-08-10T12:05:00.000Z',
        cleanupExternalTenantId: '66666666-6666-4666-8666-666666666666',
        cleanupRegistrationIds: ['1000'],
        cleanupExpiresAt: '2026-09-01T12:00:00.000Z',
      }),
    ).toMatchObject({ routeId: ROUTE_ID, kind: 'jira' });
    expect(() =>
      oauthDisconnectCleanupCommandSchema.parse({
        orgId: ORG_ID,
        tenantDeploymentId: TENANT_DEPLOYMENT_ID,
        connectionId: CONNECTION_ID,
        kind: 'jira',
        routeId: ROUTE_ID,
        generation: 'gen-1',
        disconnectEraseAfter: '2026-08-10T12:05:00.000Z',
        cleanupExternalTenantId: null,
        cleanupRegistrationIds: null,
        cleanupExpiresAt: null,
        encryptedAccessToken: 'forbidden',
      }),
    ).toThrow();
  });
});

describe('wikiArticleSchema', () => {
  it('rejects nonempty plaintext content at the enclave boundary', () => {
    expect(() =>
      wikiArticleSchema.parse({
        audienceId: null,
        content: 'customer prose',
        contentFormat: 'plaintext',
        factCount: 1,
      }),
    ).toThrow();
  });

  it('accepts only the empty plaintext compatibility sentinel', () => {
    expect(
      wikiArticleSchema.parse({
        audienceId: null,
        content: '',
        contentFormat: 'plaintext',
        factCount: 0,
      }),
    ).toMatchObject({ content: '', contentFormat: 'plaintext' });
  });

  it('requires encrypted article content to be nonempty canonical base64', () => {
    const article = {
      audienceId: null,
      contentFormat: 'esdk-v1',
      factCount: 1,
    } as const;

    expect(() => wikiArticleSchema.parse({ ...article, content: '' })).toThrow();
    expect(() => wikiArticleSchema.parse({ ...article, content: 'not base64' })).toThrow();
    expect(() => wikiArticleSchema.parse({ ...article, content: 'Zh==' })).toThrow();
    expect(wikiArticleSchema.parse({ ...article, content: 'Zg==' }).content).toBe('Zg==');
  });

  it.each([
    { audienceId: null, content: 'Zg==', contentFormat: 'esdk-v1', factCount: 1 },
    { audienceId: null, content: '', contentFormat: 'plaintext', factCount: 0 },
  ] as const)('rejects an article with an unknown plaintext-bearing field', (article) => {
    expect(() => wikiArticleSchema.parse({ ...article, plaintext: 'x' })).toThrow();
  });
});

describe('processedFactSchema', () => {
  const valid = {
    factId: 'f1',
    orgId: 'org-1',
    sourceKind: 'github',
    sourceFactId: 'github:pr:opened:1',
    occurredAt: '2026-01-01T00:00:00.000Z',
    bodyS3Key: 'facts/org-1/f1',
    bodyHash: 'abc',
    kind: 'content',
    containerRefs: [],
    explicitLinks: [],
    extractedEntities: ['@alice'],
    containerSeeds: [{ sourceContainerId: 'gh:pr:1', label: 'github_pr', shape: 'stateful' }],
    hnswNeighbors: [{ factId: 'f2', similarity: 0.9 }],
  };

  it('accepts the canonical enclave shape', () => {
    expect(processedFactSchema.parse(valid)).toMatchObject({ factId: 'f1', kind: 'content' });
  });

  it('rejects an unknown fact kind', () => {
    expect(() => processedFactSchema.parse({ ...valid, kind: 'mutation' })).toThrow();
  });

  it('requires extractedEntities', () => {
    const { extractedEntities: _omit, ...withoutEntities } = valid;
    expect(() => processedFactSchema.parse(withoutEntities)).toThrow();
  });

  it('round-trips content-free metrics', () => {
    const parsed = processedFactSchema.parse({
      ...valid,
      metrics: [{ key: 'github.pr.additions', value: 12, unit: 'lines' }],
    });
    expect(parsed.metrics).toEqual([{ key: 'github.pr.additions', value: 12, unit: 'lines' }]);
  });

  it('defaults metrics to [] when an older enclave omits it', () => {
    expect(processedFactSchema.parse(valid).metrics).toEqual([]);
  });

  it('rejects unknown fields at the root and in nested output records', () => {
    expect(processedFactSchema.safeParse({ ...valid, plaintext: 'customer prose' }).success).toBe(
      false,
    );
    expect(
      processedFactSchema.safeParse({
        ...valid,
        containerSeeds: [{ ...valid.containerSeeds[0], plaintext: 'customer prose' }],
      }).success,
    ).toBe(false);
  });
});

describe('wikiSynthesisResultSchema', () => {
  it('accepts an enclave wiki_synthesis payload with encrypted blocks', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      type: 'wiki_synthesis',
      requestId: 'req-1',
      themeId: 'theme-1',
      orgId: 'org-1',
      leaseToken: 'lease-1',
      articles: [{ audienceId: null, content: 'ZW5j', contentFormat: 'esdk-v1', factCount: 3 }],
      blocks: [
        {
          type: 'summary',
          sensitivityLevel: 'team_scoped',
          audienceId: null,
          factIds: ['f1'],
          body: { format: 'esdk-v1', ciphertext: 'YmxvY2s=' },
        },
      ],
      citedFactIds: ['f1'],
    });
    expect(parsed.blocks[0]?.body.format).toBe('esdk-v1');
  });

  it('defaults richBlockCounts to an empty array when a legacy enclave omits it', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      type: 'wiki_synthesis',
      requestId: 'req-1',
      themeId: 'theme-1',
      orgId: 'org-1',
      leaseToken: 'lease-1',
      articles: [],
      blocks: [],
      citedFactIds: [],
    });
    expect(parsed.richBlockCounts).toEqual([]);
  });

  it('carries the content-free per-kind rich-block tally', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      type: 'wiki_synthesis',
      requestId: 'req-1',
      themeId: 'theme-1',
      orgId: 'org-1',
      leaseToken: 'lease-1',
      articles: [],
      blocks: [],
      citedFactIds: [],
      richBlockCounts: [
        { kind: 'diagram', seen: 3, dropped: 1 },
        { kind: 'chart', seen: 2, dropped: 1, repaired: 1 },
      ],
    });
    expect(parsed.richBlockCounts).toEqual([
      { kind: 'diagram', seen: 3, dropped: 1, repaired: 0 },
      { kind: 'chart', seen: 2, dropped: 1, repaired: 1 },
    ]);
  });

  it('rejects a rich-block tally with an unknown kind or a fractional count', () => {
    const base = {
      type: 'wiki_synthesis',
      requestId: 'req-1',
      themeId: 'theme-1',
      orgId: 'org-1',
      leaseToken: 'lease-1',
      articles: [],
      blocks: [],
      citedFactIds: [],
    };
    expect(() =>
      wikiSynthesisResultSchema.parse({
        ...base,
        richBlockCounts: [{ kind: 'flowchart', seen: 1, dropped: 0 }],
      }),
    ).toThrow();
    expect(() =>
      wikiSynthesisResultSchema.parse({
        ...base,
        richBlockCounts: [{ kind: 'chart', seen: 1.5, dropped: 0 }],
      }),
    ).toThrow();
  });

  it('rejects unknown fields at the root and inside encrypted blocks', () => {
    const base = {
      type: 'wiki_synthesis',
      requestId: 'req-1',
      themeId: 'theme-1',
      orgId: 'org-1',
      leaseToken: 'lease-1',
      articles: [],
      citedFactIds: [],
    };
    expect(
      wikiSynthesisResultSchema.safeParse({ ...base, plaintext: 'customer prose' }).success,
    ).toBe(false);
    expect(
      wikiSynthesisResultSchema.safeParse({
        ...base,
        blocks: [
          {
            type: 'summary',
            sensitivityLevel: 'team_scoped',
            audienceId: null,
            factIds: [],
            body: { format: 'esdk-v1', ciphertext: 'YmxvY2s=' },
            plaintext: 'customer prose',
          },
        ],
      }).success,
    ).toBe(false);
  });
});

describe('tokenUsage on a synthesis result', () => {
  const base = {
    type: 'wiki_synthesis',
    requestId: 'req-1',
    themeId: 'theme-1',
    orgId: 'org-1',
    leaseToken: 'lease-1',
    articles: [],
    blocks: [],
    citedFactIds: [],
  };

  it('defaults cachedCalls so a legacy enclave still reports a total', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      ...base,
      tokenUsage: [
        {
          model: 'z-ai/glm-5.2',
          operation: 'generate',
          calls: 2,
          promptTokens: 9,
          completionTokens: 3,
        },
      ],
    });
    expect(parsed.tokenUsage[0]).toEqual({
      model: 'z-ai/glm-5.2',
      operation: 'generate',
      calls: 2,
      cachedCalls: 0,
      promptTokens: 9,
      completionTokens: 3,
    });
  });

  it('keeps free replays recoverable from the aggregate', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      ...base,
      tokenUsage: [
        {
          model: 'z-ai/glm-5.2',
          operation: 'generate',
          calls: 4,
          cachedCalls: 3,
          promptTokens: 12,
          completionTokens: 4,
        },
      ],
    });
    expect(parsed.tokenUsage[0]?.cachedCalls).toBe(3);
  });

  // The enclave and the worker deploy separately: an enclave shipping a new usage field first must
  // cost the telemetry, never the article.
  it('drops unparseable token usage rather than failing the whole result', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      ...base,
      articles: [{ audienceId: null, content: 'ZW5j', contentFormat: 'esdk-v1', factCount: 1 }],
      tokenUsage: [
        {
          model: 'z-ai/glm-5.2',
          operation: 'generate',
          calls: 1,
          promptTokens: 1,
          completionTokens: 1,
          costUsd: 0.02,
        },
      ],
    });
    expect(parsed.tokenUsage).toEqual([]);
    expect(parsed.articles).toHaveLength(1);
  });
});

describe('themeSynthesisResultSchema', () => {
  it('accepts a theme_synthesis payload', () => {
    const parsed = themeSynthesisResultSchema.parse({
      type: 'theme_synthesis',
      requestId: 'req-1',
      inputVersion: 'input-v1',
      leaseToken: 'legacy-lease-must-not-cross-the-wire',
      orgId: 'org-1',
      isAuthoritativeBatch: true,
      themes: [
        {
          themeId: 't1',
          name: 'Checkout Incident',
          kind: 'topic',
          team: 'payments',
          importance: 0.9,
          tags: ['incident'],
          containerIds: ['c1'],
          facts: [{ factId: 'f1', score: 0.92 }],
        },
      ],
      related: [{ fromThemeId: 't1', toThemeId: 't2', similarity: 0.8 }],
      aggregates: [
        {
          aggregateThemeId: 'agg-1',
          name: 'Initiative: Checkout Reliability',
          tags: ['initiative'],
          importance: 0.9,
          children: [{ childThemeId: 't1', weight: 1 }],
        },
      ],
    });
    expect(parsed.themes[0]?.kind).toBe('topic');
    // docType/confidence default in for an older enclave that omits them.
    expect(parsed.themes[0]?.docType).toBe('concept');
    expect(parsed.themes[0]?.docTypeConfidence).toBe(0);
    expect(parsed.aggregates[0]?.children[0]?.childThemeId).toBe('t1');
    expect(parsed.inputVersion).toBe('input-v1');
    expect(parsed.leaseToken).toBe('legacy-lease-must-not-cross-the-wire');
    expect(parsed.isAuthoritativeBatch).toBe(true);
  });

  it('defaults aggregates to an empty array when omitted', () => {
    const parsed = themeSynthesisResultSchema.parse({
      type: 'theme_synthesis',
      requestId: 'req-1',
      inputVersion: 'input-v1',
      leaseToken: 'lease-1',
      orgId: 'org-1',
      themes: [],
      related: [],
    });
    expect(parsed.aggregates).toEqual([]);
  });

  it('rejects an unknown root field', () => {
    expect(
      themeSynthesisResultSchema.safeParse({
        type: 'theme_synthesis',
        requestId: 'req-1',
        inputVersion: 'input-v1',
        leaseToken: 'lease-1',
        orgId: 'org-1',
        themes: [],
        related: [],
        plaintext: 'customer prose',
      }).success,
    ).toBe(false);
  });
});

describe('synthesisRequestSchema', () => {
  const valid = {
    type: 'wiki_synthesis',
    requestId: 'req-1',
    themeId: 'theme-1',
    orgId: 'org-1',
    leaseToken: 'lease-1',
    themeName: 'Checkout Rate-Limit Incident',
    themeType: 'incident',
    parentThemeCount: 0,
    factRefs: [
      {
        factId: 'f1',
        s3Key: 'facts/org-1/f1',
        occurredAt: '2026-01-01T00:00:00.000Z',
        kind: 'content',
        score: 0.7,
      },
    ],
    relatedThemes: [{ themeId: 't2', name: 'Payments', similarity: 0.8 }],
    contributorCount: 3,
    audiences: [{ id: null, name: 'All Members', publicEligible: false }],
  };

  it('accepts the producer wiki_synthesis request shape', () => {
    expect(synthesisRequestSchema.parse(valid)).toMatchObject({
      type: 'wiki_synthesis',
      themeId: 'theme-1',
    });
  });

  it('rejects a request missing the type discriminant', () => {
    const { type: _omit, ...withoutType } = valid;
    expect(() => synthesisRequestSchema.parse(withoutType)).toThrow();
  });

  it('defaults the adaptive-selection fields when a legacy producer omits them', () => {
    const parsed = synthesisRequestSchema.parse(valid);
    expect(parsed.newlyAssociatedFactIds).toEqual([]);
    expect(parsed.inputTokenBudget).toBe(DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET);
    expect(parsed.knowledgeSkeleton).toBeUndefined();
  });

  it('carries the content-free knowledge skeleton and trigger facts', () => {
    const parsed = synthesisRequestSchema.parse({
      ...valid,
      newlyAssociatedFactIds: ['f1'],
      inputTokenBudget: 12_000,
      knowledgeSkeleton: {
        node: { themeId: 'theme-1', tags: ['incident'] },
        neighbors: [
          { themeId: 't2', tags: ['decision'], edge: 'RELATED_TO', weight: 0.8, hops: 1 },
          { themeId: 't3', tags: ['initiative'], edge: 'PARENT', weight: 0.5, hops: 1 },
        ],
        entities: [{ entityId: 'e1', kind: 'repo' }],
      },
    });
    expect(parsed.newlyAssociatedFactIds).toEqual(['f1']);
    expect(parsed.inputTokenBudget).toBe(12_000);
    expect(parsed.knowledgeSkeleton?.neighbors[1]?.edge).toBe('PARENT');
  });

  it('rejects a knowledge-skeleton neighbor with more than 2 hops or an unknown edge', () => {
    const skeleton = {
      node: { themeId: 'theme-1', tags: [] },
      neighbors: [{ themeId: 't2', tags: [], edge: 'RELATED_TO', weight: 0.5, hops: 3 }],
      entities: [],
    };
    expect(() => synthesisRequestSchema.parse({ ...valid, knowledgeSkeleton: skeleton })).toThrow();
    expect(() =>
      synthesisRequestSchema.parse({
        ...valid,
        knowledgeSkeleton: {
          ...skeleton,
          neighbors: [{ ...skeleton.neighbors[0], hops: 1, edge: 'SUPERSEDES' }],
        },
      }),
    ).toThrow();
  });
});

describe('knowledgeNeighborhoodSchema', () => {
  it('accepts the hydrated cross-wiki neighborhood shape', () => {
    const parsed = knowledgeNeighborhoodSchema.parse({
      node: { themeId: 'theme-1', canonicalName: 'Checkout', tags: ['incident'], summary: 'x' },
      neighbors: [
        {
          themeId: 't2',
          canonicalName: 'Payments',
          tags: ['decision'],
          edge: 'RELATED_TO',
          weight: 0.8,
          oneLineSummary: 'The payments subsystem.',
        },
      ],
      entities: [{ entityId: 'e1', canonicalName: 'payments-api', kind: 'repo' }],
    });
    expect(parsed.neighbors[0]?.canonicalName).toBe('Payments');
  });
});

describe('themeSynthesisRequestSchema', () => {
  it('accepts the producer theme_synthesis request shape', () => {
    const parsed = themeSynthesisRequestSchema.parse({
      type: 'theme_synthesis',
      requestId: 'req-1',
      inputVersion: 'input-v1',
      leaseToken: 'legacy-lease-must-not-cross-the-wire',
      orgId: 'org-1',
      isAuthoritativeBatch: true,
      containers: [
        {
          containerId: 'c1',
          label: 'github_pr',
          team: 'payments',
          factRefs: [
            { factId: 'f1', s3Key: 'facts/org-1/f1', occurredAt: '2026-01-01T00:00:00.000Z' },
          ],
        },
      ],
    });
    expect(parsed.containers[0]?.containerId).toBe('c1');
    expect(parsed.inputVersion).toBe('input-v1');
    expect(parsed.leaseToken).toBe('legacy-lease-must-not-cross-the-wire');
    expect(parsed.isAuthoritativeBatch).toBe(true);
  });
});

describe('teamOnboardingSynthesisRequestSchema', () => {
  const valid = {
    type: 'team_onboarding_synthesis',
    requestId: 'req-1',
    orgId: 'org-1',
    teamId: 'team-1',
    teamName: 'Payments',
    themes: [
      {
        themeId: 't1',
        name: 'Checkout Rate-Limit Incident',
        themeType: 'incident',
        factRefs: [
          {
            factId: 'f1',
            s3Key: 'facts/org-1/f1',
            occurredAt: '2026-01-01T00:00:00.000Z',
            kind: 'content',
            score: 0.7,
          },
        ],
      },
    ],
    audiences: [{ id: null, name: 'All Members', publicEligible: false }],
  };

  it('accepts a cross-theme team onboarding request and defaults the adaptive fields', () => {
    const parsed = teamOnboardingSynthesisRequestSchema.parse(valid);
    expect(parsed.teamId).toBe('team-1');
    expect(parsed.themes[0]?.factRefs[0]?.sensitivityLevel).toBe('team_scoped');
    expect(parsed.newlyAssociatedFactIds).toEqual([]);
    expect(parsed.inputTokenBudget).toBe(DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET);
  });

  it('is routable through the synthesis queue discriminated union', () => {
    const parsed = synthesisQueueRequestSchema.parse(valid);
    expect(parsed.type).toBe('team_onboarding_synthesis');
  });

  it('rejects a request whose fact ref carries no s3Key', () => {
    const bad = {
      ...valid,
      themes: [
        {
          ...valid.themes[0],
          factRefs: [{ factId: 'f1', occurredAt: 'x', kind: 'content', score: 1 }],
        },
      ],
    };
    expect(() => teamOnboardingSynthesisRequestSchema.parse(bad)).toThrow();
  });
});

describe('teamOnboardingSynthesisResultSchema', () => {
  it('accepts a result with esdk-encrypted blocks and never carries prose', () => {
    const parsed = teamOnboardingSynthesisResultSchema.parse({
      type: 'team_onboarding_synthesis',
      requestId: 'req-1',
      orgId: 'org-1',
      teamId: 'team-1',
      teamName: 'Payments',
      articles: [{ audienceId: null, content: 'ZW5j', contentFormat: 'esdk-v1', factCount: 4 }],
      blocks: [
        {
          type: 'summary',
          sensitivityLevel: 'team_scoped',
          audienceId: null,
          factIds: ['f1'],
          body: { format: 'esdk-v1', ciphertext: 'YmxvY2s=' },
        },
      ],
      citedFactIds: ['f1'],
    });
    expect(parsed.blocks[0]?.body.format).toBe('esdk-v1');
  });

  it('rejects an unknown root field', () => {
    expect(
      teamOnboardingSynthesisResultSchema.safeParse({
        type: 'team_onboarding_synthesis',
        requestId: 'req-1',
        orgId: 'org-1',
        teamId: 'team-1',
        teamName: 'Payments',
        articles: [],
        blocks: [],
        citedFactIds: [],
        plaintext: 'customer prose',
      }).success,
    ).toBe(false);
  });
});

describe('pullDueMessageSchema', () => {
  it('accepts a strict scheduled pull-due signal', () => {
    const parsed = pullDueMessageSchema.parse({
      type: 'pull-due',
      trigger: 'scheduled',
      tenant_id: 'org-1',
      sourceId: 'src-1',
      kind: 'github',
      backfill: false,
    });
    expect(parsed.kind).toBe('github');
  });

  it('accepts a strict activation pull-due signal', () => {
    const parsed = pullDueMessageSchema.parse({
      type: 'pull-due',
      trigger: 'activation',
      tenant_id: 'org-1',
      sourceId: 'src-1',
      kind: 'github',
      activationGeneration: '11111111-1111-4111-8111-111111111111',
      backfill: true,
    });
    expect(parsed.trigger).toBe('activation');
  });

  it.each([
    {
      type: 'pull-due',
      trigger: 'activation',
      tenant_id: 'org-1',
      sourceId: 'src-1',
      kind: 'github',
      backfill: true,
    },
    {
      type: 'pull-due',
      trigger: 'scheduled',
      tenant_id: 'org-1',
      sourceId: 'src-1',
      kind: 'github',
      activationGeneration: '11111111-1111-4111-8111-111111111111',
      backfill: true,
    },
    {
      type: 'pull-due',
      tenant_id: 'org-1',
      sourceId: 'src-1',
      kind: 'github',
      backfill: true,
    },
  ])('rejects legacy or cross-trigger fields', (message) => {
    expect(pullDueMessageSchema.safeParse(message).success).toBe(false);
  });
});

describe('pullCompleteSignalSchema', () => {
  const valid = {
    type: 'pull-complete',
    orgId: 'org-1',
    sourceKind: 'github',
    sourceId: 'src-1',
    completedAt: '2026-01-01T00:00:00.000Z',
  };

  it('accepts the content-free completion signal', () => {
    expect(pullCompleteSignalSchema.parse(valid).sourceKind).toBe('github');
  });

  it('rejects a non-ISO completedAt', () => {
    expect(() => pullCompleteSignalSchema.parse({ ...valid, completedAt: 'yesterday' })).toThrow();
  });

  it('rejects an unknown root field', () => {
    expect(pullCompleteSignalSchema.safeParse({ ...valid, body: 'customer prose' }).success).toBe(
      false,
    );
  });
});

// Drift guard: these mirror the enclave's local `interface`s verbatim. A change to either schema
// breaks compilation here, forcing the enclave mirror to be updated in lockstep.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

type EnclaveKnowledgeSkeleton = {
  node: { themeId: string; tags: string[] };
  neighbors: {
    themeId: string;
    tags: string[];
    edge: 'RELATED_TO' | 'PARENT' | 'CHILD';
    weight: number;
    hops: number;
  }[];
  entities: { entityId: string; kind: string }[];
};

type EnclaveSynthesisRequest = {
  type: 'wiki_synthesis';
  requestId: string;
  themeId: string;
  orgId: string;
  leaseToken: string;
  themeName: string;
  themeType: string;
  parentThemeCount: number;
  factRefs: { factId: string; s3Key: string; occurredAt: string; kind: string; score: number }[];
  relatedThemes: { themeId: string; name: string; similarity: number }[];
  contributorCount: number;
  audiences: { id: string | null; name: string; publicEligible: boolean }[];
  newlyAssociatedFactIds: string[];
  inputTokenBudget: number;
  knowledgeSkeleton?: EnclaveKnowledgeSkeleton;
};

type _KnowledgeSkeletonPinned = Expect<Equal<KnowledgeSkeleton, EnclaveKnowledgeSkeleton>>;

type EnclaveWikiSynthesisResult = {
  type: 'wiki_synthesis';
  requestId: string;
  themeId: string;
  orgId: string;
  leaseToken: string;
  articles: {
    audienceId: string | null;
    content: string;
    contentFormat: 'esdk-v1' | 'plaintext';
    factCount: number;
  }[];
  blocks: {
    type: string;
    sensitivityLevel: 'public' | 'team_scoped' | 'restricted' | 'confidential';
    audienceId: string | null;
    factIds: string[];
    body: { format: 'esdk-v1'; ciphertext: string };
  }[];
  citedFactIds: string[];
  richBlockCounts: {
    kind: 'diagram' | 'graph' | 'chart' | 'code' | 'embed';
    seen: number;
    dropped: number;
    repaired: number;
  }[];
};

type _WikiSynthesisResultPinned = Expect<Equal<WikiSynthesisResult, EnclaveWikiSynthesisResult>>;

type EnclaveThemeSynthesisRequest = {
  type: 'theme_synthesis';
  requestId: string;
  inputVersion: string;
  leaseToken: string;
  orgId: string;
  isAuthoritativeBatch?: boolean;
  containers: {
    containerId: string;
    label: string;
    team: string;
    factRefs: { factId: string; s3Key: string; occurredAt: string }[];
  }[];
};

type EnclavePullDueMessage =
  | {
      type: 'pull-due';
      trigger: 'scheduled';
      tenant_id: string;
      sourceId: string;
      kind: string;
      backfill: boolean;
      backfillLeaseToken?: string;
    }
  | {
      type: 'pull-due';
      trigger: 'activation';
      tenant_id: string;
      sourceId: string;
      kind: string;
      activationGeneration: string;
      backfill: true;
    };

type EnclavePullCompleteSignal = {
  type: 'pull-complete';
  orgId: string;
  sourceKind: string;
  sourceId: string;
  completedAt: string;
  backfillLeaseToken?: string;
};

type _SynthesisRequestPinned = Expect<Equal<SynthesisRequest, EnclaveSynthesisRequest>>;
type _ThemeSynthesisRequestPinned = Expect<
  Equal<ThemeSynthesisRequest, EnclaveThemeSynthesisRequest>
>;
type _PullDueMessagePinned = Expect<Equal<PullDueMessage, EnclavePullDueMessage>>;
type _PullCompleteSignalPinned = Expect<Equal<PullCompleteSignal, EnclavePullCompleteSignal>>;

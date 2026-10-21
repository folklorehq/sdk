// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  AUTHOR_DISPLAY_NAME_MAX,
  AUTHOR_EMAIL_MAX,
  AUTHOR_SOURCE_USER_ID_MAX,
  FEED_FACT_SALIENCE,
  SALIENT_FACT_SALIENCE,
  DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET,
  FACT_AUTHORS_RESULT_MAX_BYTES,
  FACT_AUTHOR_REEXTRACT_MAX_FACTS,
  FACT_AUTHOR_REEXTRACT_SOURCE_KIND_MAX,
  GITHUB_ACCOUNT_ID_PATTERN,
  INFERENCE_TIMELINE_MAX_SPANS,
  PROCESSED_FACT_MAX_AUTHORS,
  associationJudgementResultSchema,
  factAuthorReextractRequestSchema,
  factAuthorsResultSchema,
  factSalienceSchema,
  knowledgeNeighborhoodSchema,
  processedFactAuthorSchema,
  processedFactSchema,
  processedFactUnlinkedAuthorSchema,
  pullCompleteSignalSchema,
  pullDueMessageSchema,
  oauthDisconnectCleanupCommandSchema,
  oauthCodeGrantAad,
  sealedGitHubInstallationSubmissionSchema,
  synthesisQueueRequestSchema,
  synthesisRequestSchema,
  teamOnboardingSynthesisRequestSchema,
  teamOnboardingSynthesisResultSchema,
  themeSynthesisRequestSchema,
  themeSynthesisResultSchema,
  PAGE_TITLE_MAX_LENGTH,
  aggregateThemeSchema,
  isValidPageTitle,
  wikiArticleSchema,
  wikiSynthesisArticleSchema,
  webhookLifecycleClaimSchema,
  webhookLifecycleCleanupClearSchema,
  webhookLifecycleDeliverySchema,
  webhookLifecycleFinalizeSchema,
  webhookProtocolCaptureSchema,
  wikiSynthesisResultSchema,
  type CritiqueOutcome,
  type EncryptedBodyRead,
  type KnowledgeSkeleton,
  type PullCompleteSignal,
  type PullStatsSignal,
  type PullDueMessage,
  type SensitivityLevel,
  type SynthesisRequest,
  type ThemeSynthesisRequest,
  type InferenceTimeline,
  type TokenUsage,
  type WikiPageStateEnvelope,
  type WikiShadowArticle,
  type WikiSynthesisResult,
} from '../src/enclave.js';
import type { ClaudeQualityScores } from '../src/claude-inference.js';

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

describe('oauthCodeGrantAad', () => {
  const grant = {
    deploymentId: 'd',
    orgId: 'o',
    sourceKind: 'slack',
    callbackUri: 'https://cb.example/x',
    attestationGeneration: 'g',
    activationGeneration: 'a',
    stateBindingId: 's',
    issuedAt: 'i',
    expiresAt: 'e',
  };

  it('keeps the existing AAD for a grant without an installation', () => {
    expect(oauthCodeGrantAad(grant)).toBe(
      'folklore.oauth-code-grant.v1|d|o|slack|https://cb.example/x|g|a|s|i|e',
    );
    expect(oauthCodeGrantAad({ ...grant, activationGeneration: undefined })).toBe(
      'folklore.oauth-code-grant.v1|d|o|slack|https://cb.example/x|g||s|i|e',
    );
  });

  it('binds a GitHub installation id into the AAD', () => {
    expect(oauthCodeGrantAad({ ...grant, sourceKind: 'github', installationId: '555000' })).toBe(
      'folklore.oauth-code-grant.v1|d|o|github|https://cb.example/x|g|a|s|i|e|installation:555000',
    );
  });
});

describe('sealedGitHubInstallationSubmissionSchema', () => {
  const submission = {
    deploymentId: RUNTIME_DEPLOYMENT_ID,
    orgId: '22222222-2222-4222-8222-222222222222',
    sourceKind: 'github',
    connectionId: '33333333-3333-4333-8333-333333333333',
    activationGeneration: '44444444-4444-4444-8444-444444444444',
    attestationGeneration: 'generation-1',
    stateBindingId: 'a'.repeat(64),
    installationId: '555000',
    encryptedCodeGrant: '{"sealed":true}',
    ciphertextSha256: 'b'.repeat(64),
  };

  it('carries the install code only as a sealed grant', () => {
    expect(sealedGitHubInstallationSubmissionSchema.parse(submission)).toEqual(submission);
  });

  it.each(['encryptedCodeGrant', 'ciphertextSha256'] as const)(
    'refuses a submission without %s',
    (field) => {
      const { [field]: _omitted, ...rest } = submission;
      expect(sealedGitHubInstallationSubmissionSchema.safeParse(rest).success).toBe(false);
    },
  );

  it('refuses a plaintext install code', () => {
    expect(
      sealedGitHubInstallationSubmissionSchema.safeParse({ ...submission, code: 'install-code' })
        .success,
    ).toBe(false);
  });
});

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

describe('the page title on a synthesized article', () => {
  const article = { audienceId: null, content: 'Zg==', contentFormat: 'esdk-v1', factCount: 1 };

  it('is not part of the team onboarding article, which stays closed', () => {
    expect(() => wikiArticleSchema.parse({ ...article, title: 'Billing Accuracy' })).toThrow();
  });

  it('is optional, so an article from an enclave that omits it still parses', () => {
    expect(wikiSynthesisArticleSchema.parse(article)).not.toHaveProperty('title');
    expect(
      wikiSynthesisArticleSchema.parse({ ...article, title: 'Billing Accuracy' }),
    ).toMatchObject({
      title: 'Billing Accuracy',
    });
  });

  it('rides the empty plaintext sentinel too', () => {
    expect(
      wikiSynthesisArticleSchema.parse({
        audienceId: null,
        content: '',
        contentFormat: 'plaintext',
        factCount: 0,
        title: 'Billing Accuracy',
      }),
    ).toMatchObject({ title: 'Billing Accuracy' });
  });

  it.each([
    ['empty', ''],
    ['padded', ' Billing'],
    ['markdown emphasis', '**Billing**'],
    ['a heading marker', '# Billing'],
    ['a link', '[Billing](x)'],
    ['a line break', 'Billing\nAccuracy'],
    ['too long', 'B'.repeat(PAGE_TITLE_MAX_LENGTH + 1)],
  ])('drops a title that is %s and keeps the article', (_label, title) => {
    expect(isValidPageTitle(title)).toBe(false);
    const parsed = wikiSynthesisArticleSchema.parse({ ...article, title });
    expect(parsed.title).toBeUndefined();
    expect(parsed).toMatchObject({ content: 'Zg==', factCount: 1 });
  });

  it('drops a non-string title the same way', () => {
    expect(wikiSynthesisArticleSchema.parse({ ...article, title: 42 }).title).toBeUndefined();
  });

  it('still rejects an unknown field beside the title', () => {
    expect(() =>
      wikiSynthesisArticleSchema.parse({ ...article, title: 'Billing', plaintext: 'x' }),
    ).toThrow();
  });

  it('accepts a title at the length cap', () => {
    expect(isValidPageTitle('B'.repeat(PAGE_TITLE_MAX_LENGTH))).toBe(true);
  });
});

describe('aggregateThemeSchema', () => {
  const aggregate = {
    aggregateThemeId: 'agg-1',
    name: 'Initiative: Activity',
    tags: ['initiative'],
    importance: 0.5,
    children: [{ childThemeId: 't1', weight: 1 }],
  };

  it('carries an optional fallback-name flag and omits it by default', () => {
    expect(aggregateThemeSchema.parse(aggregate)).not.toHaveProperty('namedByFallback');
    expect(aggregateThemeSchema.parse({ ...aggregate, namedByFallback: true })).toMatchObject({
      namedByFallback: true,
    });
    expect(aggregateThemeSchema.safeParse({ ...aggregate, namedByFallback: 'yes' }).success).toBe(
      false,
    );
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

  describe('salience', () => {
    const SALIENCE_VALUES = [
      'decision',
      'incident',
      'merge',
      'issue_transition',
      'deletion',
      'human',
      'agent',
      'ci',
      'routine',
    ] as const;

    it.each(SALIENCE_VALUES)('accepts %s', (salience) => {
      expect(processedFactSchema.parse({ ...valid, salience }).salience).toBe(salience);
    });

    it('leaves salience absent, with no default, when an older enclave omits it', () => {
      const parsed = processedFactSchema.parse(valid);
      expect(parsed.salience).toBeUndefined();
      expect('salience' in parsed).toBe(false);
    });

    it.each(['other', '', 'DECISION', null, 1])('rejects %j', (salience) => {
      expect(processedFactSchema.safeParse({ ...valid, salience }).success).toBe(false);
    });

    it('keeps the strict parse rejecting an unknown key beside salience', () => {
      expect(
        processedFactSchema.safeParse({ ...valid, salience: 'human', reason: 'because' }).success,
      ).toBe(false);
    });

    it('lists the nine values once in the schema and splits layer B from layer A by deletion alone', () => {
      expect([...factSalienceSchema.options].sort()).toEqual([...SALIENCE_VALUES].sort());
      expect([...SALIENT_FACT_SALIENCE].sort()).toEqual(
        ['decision', 'deletion', 'human', 'incident', 'issue_transition', 'merge'].sort(),
      );
      expect([...FEED_FACT_SALIENCE].sort()).toEqual(
        ['decision', 'human', 'incident', 'issue_transition', 'merge'].sort(),
      );
      expect(FEED_FACT_SALIENCE.has('deletion')).toBe(false);
      for (const value of FEED_FACT_SALIENCE) expect(SALIENT_FACT_SALIENCE.has(value)).toBe(true);
      for (const quiet of ['agent', 'ci', 'routine'] as const) {
        expect(SALIENT_FACT_SALIENCE.has(quiet)).toBe(false);
        expect(FEED_FACT_SALIENCE.has(quiet)).toBe(false);
      }
    });
  });

  describe('authors', () => {
    const author = {
      sourceUserId: '42',
      role: 'author',
      email: 'alice@example.com',
      emailVerified: true,
      displayName: 'Alice',
    } as const;
    const emailOfLength = (length: number): string => `${'a'.repeat(length - 12)}@example.com`;
    const authorsOf = (count: number) =>
      Array.from({ length: count }, (_, index) => ({ sourceUserId: `u${index}`, role: 'author' }));

    it('leaves authors absent when an older enclave omits it', () => {
      const parsed = processedFactSchema.parse(valid);
      expect('authors' in parsed).toBe(false);
      expect(parsed).toEqual({ ...valid, sensitivityLevel: 'team_scoped', metrics: [] });
    });

    it('round-trips a bounded author', () => {
      expect(processedFactSchema.parse({ ...valid, authors: [author] }).authors).toEqual([author]);
    });

    it('rejects an unknown author field', () => {
      expect(
        processedFactSchema.safeParse({ ...valid, authors: [{ ...author, plaintext: 'x' }] })
          .success,
      ).toBe(false);
    });

    it('rejects a role outside author/co_author', () => {
      expect(
        processedFactSchema.safeParse({ ...valid, authors: [{ ...author, role: 'reviewer' }] })
          .success,
      ).toBe(false);
    });

    it('rejects more than 50 authors', () => {
      expect(
        processedFactSchema.safeParse({
          ...valid,
          authors: authorsOf(PROCESSED_FACT_MAX_AUTHORS + 1),
        }).success,
      ).toBe(false);
    });

    it('rejects an empty sourceUserId', () => {
      expect(processedFactAuthorSchema.safeParse({ ...author, sourceUserId: '' }).success).toBe(
        false,
      );
    });

    it('rejects an email of 2 chars and accepts one of 3', () => {
      expect(processedFactAuthorSchema.safeParse({ ...author, email: 'a@' }).success).toBe(false);
      expect(processedFactAuthorSchema.parse({ ...author, email: 'a@b' }).email).toBe('a@b');
    });

    it.each(['ab.example.com', 'a@b@example.com', 'a b@example.com', 'ab@example.com\n'])(
      'rejects the email %j without exactly one @ or with whitespace',
      (email) => {
        expect(processedFactAuthorSchema.safeParse({ ...author, email }).success).toBe(false);
      },
    );

    it('accepts a sourceUserId of 256 chars and rejects one of 257', () => {
      const atMax = 'u'.repeat(AUTHOR_SOURCE_USER_ID_MAX);
      expect(processedFactAuthorSchema.parse({ ...author, sourceUserId: atMax }).sourceUserId).toBe(
        atMax,
      );
      expect(
        processedFactAuthorSchema.safeParse({ ...author, sourceUserId: `${atMax}u` }).success,
      ).toBe(false);
    });

    it('rejects an empty displayName', () => {
      expect(processedFactAuthorSchema.safeParse({ ...author, displayName: '' }).success).toBe(
        false,
      );
    });

    it('rejects an email over 320 chars', () => {
      expect(
        processedFactAuthorSchema.safeParse({
          ...author,
          email: emailOfLength(AUTHOR_EMAIL_MAX + 1),
        }).success,
      ).toBe(false);
    });

    it('rejects emailVerified without email', () => {
      const { email: _omit, ...withoutEmail } = author;
      expect(processedFactAuthorSchema.safeParse(withoutEmail).success).toBe(false);
    });

    it('rejects emailVerified: false', () => {
      expect(processedFactAuthorSchema.safeParse({ ...author, emailVerified: false }).success).toBe(
        false,
      );
    });

    it('accepts exactly 50 authors', () => {
      expect(
        processedFactSchema.parse({ ...valid, authors: authorsOf(PROCESSED_FACT_MAX_AUTHORS) })
          .authors,
      ).toHaveLength(PROCESSED_FACT_MAX_AUTHORS);
    });

    it('accepts an email of exactly 320 chars', () => {
      const email = emailOfLength(AUTHOR_EMAIL_MAX);
      expect(processedFactAuthorSchema.parse({ ...author, email }).email).toBe(email);
    });

    it('accepts a display name of exactly 256 chars', () => {
      const displayName = 'n'.repeat(AUTHOR_DISPLAY_NAME_MAX);
      expect(processedFactAuthorSchema.parse({ ...author, displayName }).displayName).toBe(
        displayName,
      );
    });

    it('rejects a display name over 256 chars', () => {
      expect(
        processedFactAuthorSchema.safeParse({
          ...author,
          displayName: 'n'.repeat(AUTHOR_DISPLAY_NAME_MAX + 1),
        }).success,
      ).toBe(false);
    });

    it('accepts an author without email or displayName', () => {
      const parsed = processedFactAuthorSchema.parse({ sourceUserId: '42', role: 'co_author' });
      expect(parsed).toEqual({ sourceUserId: '42', role: 'co_author' });
      expect('email' in parsed).toBe(false);
      expect('displayName' in parsed).toBe(false);
    });

    it('round-trips an author with a GitHub login', () => {
      const withLogin = { ...author, sourceLogin: 'octo-cat' };
      expect(processedFactAuthorSchema.parse(withLogin)).toEqual(withLogin);
    });

    it.each(['Octo', '-x', 'a'.repeat(40)])('rejects the GitHub login %s', (sourceLogin) => {
      expect(processedFactAuthorSchema.safeParse({ ...author, sourceLogin }).success).toBe(false);
    });

    it('accepts a bot login', () => {
      expect(
        processedFactAuthorSchema.parse({ ...author, sourceLogin: 'dependabot[bot]' }).sourceLogin,
      ).toBe('dependabot[bot]');
    });
  });

  describe('unlinkedAuthors', () => {
    it.each([
      { role: 'author', displayName: 'Ada' },
      { role: 'author', sourceLogin: 'ada' },
      { role: 'co_author', sourceLogin: 'ada', displayName: 'Ada' },
    ] as const)('round-trips an unlinked author %o', (unlinked) => {
      expect(
        processedFactSchema.parse({ ...valid, unlinkedAuthors: [unlinked] }).unlinkedAuthors,
      ).toEqual([unlinked]);
    });

    it('rejects an unlinked author with neither a login nor a name', () => {
      expect(processedFactUnlinkedAuthorSchema.safeParse({ role: 'author' }).success).toBe(false);
    });

    it('rejects an unlinked author with an extra key', () => {
      expect(
        processedFactUnlinkedAuthorSchema.safeParse({
          role: 'author',
          displayName: 'Ada',
          email: 'ada@example.com',
        }).success,
      ).toBe(false);
    });

    it('rejects more than 50 unlinked authors', () => {
      const unlinked = Array.from({ length: PROCESSED_FACT_MAX_AUTHORS + 1 }, (_, index) => ({
        role: 'author',
        displayName: `Author ${index}`,
      }));
      expect(processedFactSchema.safeParse({ ...valid, unlinkedAuthors: unlinked }).success).toBe(
        false,
      );
    });

    it('rejects an unlinked author with an invalid login', () => {
      expect(
        processedFactUnlinkedAuthorSchema.safeParse({ role: 'author', sourceLogin: 'Octo' })
          .success,
      ).toBe(false);
    });

    it('rejects an unlinked author with a name over 256 chars', () => {
      expect(
        processedFactUnlinkedAuthorSchema.safeParse({
          role: 'author',
          displayName: 'n'.repeat(AUTHOR_DISPLAY_NAME_MAX + 1),
        }).success,
      ).toBe(false);
    });

    it('leaves unlinkedAuthors absent when an older enclave omits it', () => {
      expect('unlinkedAuthors' in processedFactSchema.parse(valid)).toBe(false);
    });
  });
});

describe('wikiSynthesisResultSchema', () => {
  it('keeps the page result when an article carries a malformed title', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      type: 'wiki_synthesis',
      requestId: 'req-1',
      themeId: 'theme-1',
      orgId: 'org-1',
      leaseToken: 'lease-1',
      articles: [
        {
          audienceId: null,
          content: 'ZW5j',
          contentFormat: 'esdk-v1',
          factCount: 3,
          title: '**bold** title',
        },
      ],
      blocks: [],
      citedFactIds: [],
    });
    expect(parsed.articles).toHaveLength(1);
    expect(parsed.articles[0]?.title).toBeUndefined();
  });

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
    expect(parsed.blocks[0]?.body).toMatchObject({ format: 'esdk-v1' });
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

describe('inference timing on a synthesis result', () => {
  const base = {
    type: 'wiki_synthesis',
    requestId: 'req-1',
    themeId: 'theme-1',
    orgId: 'org-1',
    leaseToken: 'lease-1',
    articles: [{ audienceId: null, content: 'ZW5j', contentFormat: 'esdk-v1', factCount: 1 }],
    blocks: [],
    citedFactIds: [],
  };
  const usage = {
    model: 'z-ai/glm-5.2',
    operation: 'generate',
    calls: 2,
    cachedCalls: 0,
    promptTokens: 9,
    completionTokens: 3,
  };
  const timing = {
    calls: 2,
    trustedTimeMs: 40,
    trustedTimeMaxMs: 25,
    bindMs: 60,
    bindMaxMs: 35,
    requestMs: 9000,
    requestMaxMs: 6000,
    responseMs: 300,
    responseMaxMs: 200,
    verifyMs: 120,
    verifyMaxMs: 80,
  };
  const span = {
    seq: 0,
    phase: 'request',
    model: 'z-ai/glm-5.2',
    role: 'generate',
    startOffsetMs: 12,
    durationMs: 6000,
    outcome: 'ok',
  };

  it('carries per-model timing aggregates on a usage entry', () => {
    const parsed = wikiSynthesisResultSchema.parse({ ...base, tokenUsage: [{ ...usage, timing }] });
    expect(parsed.tokenUsage[0]?.timing).toEqual(timing);
  });

  it('parses a result from an enclave that sends no timing, adding none', () => {
    const parsed = wikiSynthesisResultSchema.parse({ ...base, tokenUsage: [usage] });
    expect(parsed.tokenUsage[0]).toEqual(usage);
    expect('timing' in (parsed.tokenUsage[0] ?? {})).toBe(false);
    expect('timeline' in parsed).toBe(false);
  });

  it('carries a bounded span timeline with its dropped count', () => {
    const timeline = {
      spans: [span, { seq: 1, phase: 'draft', startOffsetMs: 10, durationMs: 7000, outcome: 'ok' }],
      spansDropped: 3,
    };
    const parsed = wikiSynthesisResultSchema.parse({ ...base, tokenUsage: [usage], timeline });
    expect(parsed.timeline).toEqual(timeline);
  });

  it.each([
    ['theme_synthesis', themeSynthesisResultSchema],
    ['team_onboarding_synthesis', teamOnboardingSynthesisResultSchema],
    ['association_judgement', associationJudgementResultSchema],
  ] as const)('accepts a timeline on a %s result', (_type, schema) => {
    const timeline = { spans: [span], spansDropped: 0 };
    expect(schema.shape.timeline.parse(timeline)).toEqual(timeline);
  });

  it('keeps a failure code in its fixed slug shape', () => {
    const failed = { ...span, outcome: 'error_code', errorCode: 'synthesis_provider_http_503' };
    const parsed = wikiSynthesisResultSchema.parse({
      ...base,
      timeline: { spans: [failed], spansDropped: 0 },
    });
    expect(parsed.timeline?.spans[0]?.errorCode).toBe('synthesis_provider_http_503');
  });

  // A timeline is telemetry: whatever is wrong with it costs the timeline, never the article.
  it.each([
    ['an unknown phase', { ...span, phase: 'prompt_dump' }],
    ['an unknown outcome', { ...span, outcome: 'refused' }],
    ['a prose error code', { ...span, outcome: 'error_code', errorCode: 'Customer said hello' }],
    ['a model id with spaces', { ...span, model: 'the quarterly plan' }],
    ['an unknown role', { ...span, role: 'writer' }],
    ['a fractional duration', { ...span, durationMs: 1.5 }],
    ['an extra member', { ...span, text: 'secret' }],
  ])('drops a timeline with %s and keeps the article', (_label, bad) => {
    const parsed = wikiSynthesisResultSchema.parse({
      ...base,
      timeline: { spans: [bad], spansDropped: 0 },
    });
    expect(parsed.timeline).toBeUndefined();
    expect(parsed.articles).toHaveLength(1);
  });

  it('refuses a timeline longer than the span cap', () => {
    const spans = Array.from({ length: INFERENCE_TIMELINE_MAX_SPANS + 1 }, (_, seq) => ({
      ...span,
      seq,
    }));
    const parsed = wikiSynthesisResultSchema.parse({
      ...base,
      timeline: { spans, spansDropped: 0 },
    });
    expect(parsed.timeline).toBeUndefined();
  });

  it('drops usage carrying an unknown timing member, as an older worker drops a newer field', () => {
    const parsed = wikiSynthesisResultSchema.parse({
      ...base,
      tokenUsage: [{ ...usage, timing: { ...timing, promptText: 'secret' } }],
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
    expect(parsed.themes[0]).not.toHaveProperty('namedByFallback');
    expect(parsed.aggregates[0]?.children[0]?.childThemeId).toBe('t1');
    expect(parsed.inputVersion).toBe('input-v1');
    expect(parsed.leaseToken).toBe('legacy-lease-must-not-cross-the-wire');
    expect(parsed.isAuthoritativeBatch).toBe(true);
  });

  it('carries a boolean fallback-name flag on each theme', () => {
    const theme = {
      themeId: 't1',
      name: 'payments: incident (03-04–03-04)',
      kind: 'topic',
      team: 'payments',
      importance: 0.9,
      tags: ['incident'],
      containerIds: ['c1'],
      facts: [],
    };
    const payload = (namedByFallback: unknown) => ({
      type: 'theme_synthesis',
      requestId: 'req-1',
      inputVersion: 'input-v1',
      leaseToken: 'lease-1',
      orgId: 'org-1',
      themes: [{ ...theme, namedByFallback }],
      related: [],
    });

    expect(themeSynthesisResultSchema.parse(payload(true)).themes[0]?.namedByFallback).toBe(true);
    expect(themeSynthesisResultSchema.safeParse(payload('yes')).success).toBe(false);
  });

  it('round-trips an old-shape theme without adding the fallback flag', () => {
    const oldShape = {
      type: 'theme_synthesis',
      requestId: 'req-1',
      inputVersion: 'input-v1',
      leaseToken: 'lease-1',
      orgId: 'org-1',
      themes: [
        {
          themeId: 't1',
          name: 'payments: Checkout Reliability',
          kind: 'topic',
          team: 'payments',
          importance: 0.9,
          tags: ['incident'],
          containerIds: ['c1'],
          facts: [],
        },
      ],
      related: [],
    };

    const parsed = themeSynthesisResultSchema.parse(oldShape);
    const reparsed = themeSynthesisResultSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(parsed.themes[0]).not.toHaveProperty('namedByFallback');
    expect(JSON.stringify(parsed)).not.toContain('namedByFallback');
    expect(reparsed.themes[0]).not.toHaveProperty('namedByFallback');
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

  it('carries each audience source-kind scope and leaves it undefined for an older producer', () => {
    const [legacy] = synthesisRequestSchema.parse(valid).audiences;
    expect(legacy?.allowedSourceKinds).toBeUndefined();
    const [scoped] = synthesisRequestSchema.parse({
      ...valid,
      audiences: [{ ...valid.audiences[0], allowedSourceKinds: ['slack', 'github'] }],
    }).audiences;
    expect(scoped?.allowedSourceKinds).toEqual(['slack', 'github']);
  });

  it('bounds the audience source-kind scope', () => {
    const audience = (allowedSourceKinds: string[]) => ({
      ...valid.audiences[0],
      allowedSourceKinds,
    });
    const parse = (kinds: string[]) =>
      synthesisRequestSchema.parse({ ...valid, audiences: [audience(kinds)] });
    expect(() => parse(Array.from({ length: 65 }, (_, i) => `k${i}`))).toThrow();
    expect(() => parse(['x'.repeat(65)])).toThrow();
    expect(parse([])).toBeTruthy();
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

  it('keeps a sectioned generation request', () => {
    expect(synthesisRequestSchema.parse({ ...valid, generation: 'sectioned' }).generation).toBe(
      'sectioned',
    );
    expect(synthesisQueueRequestSchema.parse({ ...valid, generation: 'sectioned' })).toMatchObject({
      type: 'wiki_synthesis',
      generation: 'sectioned',
    });
  });

  it('leaves generation absent when the producer omits it', () => {
    expect('generation' in synthesisRequestSchema.parse(valid)).toBe(false);
  });

  it('rejects an unknown generation', () => {
    expect(() => synthesisRequestSchema.parse({ ...valid, generation: 'outline' })).toThrow();
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
    expect(parsed.blocks[0]?.body).toMatchObject({ format: 'esdk-v1' });
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

  describe('stats', () => {
    const stats = {
      facts: 3,
      contentFacts: 2,
      embedInputCharsBucket: 20_000,
      listed: 5,
      emitted: 3,
      apiCalls: 2,
      listingRestarts: 0,
      skipped: { archived: 2 },
      durationMs: 1200,
      hasMore: true,
      backfill: false,
    };
    const parseWith = (override: Record<string, unknown>) =>
      pullCompleteSignalSchema.safeParse({ ...valid, stats: { ...stats, ...override } }).success;

    it('parses with and without stats', () => {
      expect(pullCompleteSignalSchema.safeParse({ ...valid, stats }).success).toBe(true);
      expect(pullCompleteSignalSchema.safeParse(valid).success).toBe(true);
    });

    it('accepts the optional body figures', () => {
      expect(parseWith({ bodyCharsBucket: 30_000, truncatedBodies: 1 })).toBe(true);
    });

    it('rejects an extra key inside stats', () => {
      expect(parseWith({ title: 'x' })).toBe(false);
    });

    it('rejects an extra key inside skipped', () => {
      expect(parseWith({ skipped: { archived: 1, pageId: 2 } })).toBe(false);
    });

    it('rejects a negative count', () => {
      expect(parseWith({ listed: -1 })).toBe(false);
    });

    it('rejects a fractional count', () => {
      expect(parseWith({ apiCalls: 1.5 })).toBe(false);
    });

    it('rejects a bucket that is not a multiple of 10,000', () => {
      expect(parseWith({ embedInputCharsBucket: 15_000 })).toBe(false);
      expect(parseWith({ bodyCharsBucket: 1 })).toBe(false);
    });

    it('rejects a string count', () => {
      expect(parseWith({ facts: '3' })).toBe(false);
    });
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
  factRefs: {
    factId: string;
    s3Key: string;
    occurredAt: string;
    kind: string;
    score: number;
    sourceKind?: string;
    sensitivityLevel: SensitivityLevel;
  }[];
  relatedThemes: { themeId: string; name: string; similarity: number }[];
  contributorCount: number;
  audiences: {
    id: string | null;
    name: string;
    publicEligible: boolean;
    maxSensitivity: SensitivityLevel;
    allowedSourceKinds?: string[];
  }[];
  newlyAssociatedFactIds: string[];
  inputTokenBudget: number;
  knowledgeSkeleton?: EnclaveKnowledgeSkeleton;
  generation?: 'article' | 'sectioned';
  // Mirrors the enclave's SynthesisConsumer request shape.
  previousPageStates?: WikiPageStateEnvelope[];
  shadowArms?: ('R' | 'B')[];
};

type _KnowledgeSkeletonPinned = Expect<Equal<KnowledgeSkeleton, EnclaveKnowledgeSkeleton>>;

type EnclaveWikiSynthesisResult = {
  type: 'wiki_synthesis';
  requestId: string;
  themeId: string;
  orgId: string;
  leaseToken: string;
  articles: (
    | {
        audienceId: string | null;
        content: string;
        contentFormat: 'esdk-v1';
        factCount: number;
        title?: string;
      }
    | {
        audienceId: string | null;
        content: '';
        contentFormat: 'plaintext';
        factCount: number;
        title?: string;
      }
  )[];
  blocks: {
    type: string;
    sensitivityLevel: SensitivityLevel;
    audienceId: string | null;
    factIds: string[];
    body: EncryptedBodyRead;
    promptHash?: string;
  }[];
  citedFactIds: string[];
  richBlockCounts: {
    kind: 'diagram' | 'graph' | 'chart' | 'code' | 'embed' | 'canvas';
    seen: number;
    dropped: number;
    repaired: number;
  }[];
  critique?: CritiqueOutcome;
  tokenUsage: TokenUsage[];
  timeline?: InferenceTimeline | undefined;
  // Mirrors the enclave's SynthesisConsumer result shape.
  pageStates?: WikiPageStateEnvelope[];
  shadowArticles?: WikiShadowArticle[];
  qualityScores?: ClaudeQualityScores[];
  untaggedCalls?: number;
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
    factRefs: { factId: string; s3Key: string; occurredAt: string; entities: string[] }[];
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
      ownerAccountId?: string;
    }
  | {
      type: 'pull-due';
      trigger: 'activation';
      tenant_id: string;
      sourceId: string;
      kind: string;
      activationGeneration: string;
      backfill: true;
      ownerAccountId?: string;
    };

type EnclavePullCompleteSignal = {
  type: 'pull-complete';
  orgId: string;
  sourceKind: string;
  sourceId: string;
  completedAt: string;
  backfillLeaseToken?: string;
  stats?: PullStatsSignal;
};

type _SynthesisRequestPinned = Expect<Equal<SynthesisRequest, EnclaveSynthesisRequest>>;
type _ThemeSynthesisRequestPinned = Expect<
  Equal<ThemeSynthesisRequest, EnclaveThemeSynthesisRequest>
>;
type _PullDueMessagePinned = Expect<Equal<PullDueMessage, EnclavePullDueMessage>>;
type _PullCompleteSignalPinned = Expect<Equal<PullCompleteSignal, EnclavePullCompleteSignal>>;

describe('fact author re-extract request', () => {
  const ref = (index: number) => ({
    factId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    sourceKind: 'github',
    s3Key: `facts/org/${index}`,
  });
  const request = (count: number) => ({
    type: 'fact_author_reextract' as const,
    requestId: 'a'.repeat(64),
    orgId: '123e4567-e89b-42d3-a456-426614174000',
    facts: Array.from({ length: count }, (_, index) => ref(index + 1)),
  });

  it.each([1, FACT_AUTHOR_REEXTRACT_MAX_FACTS])('accepts %i facts', (count) => {
    expect(factAuthorReextractRequestSchema.safeParse(request(count)).success).toBe(true);
  });

  it.each([0, FACT_AUTHOR_REEXTRACT_MAX_FACTS + 1])('rejects %i facts', (count) => {
    expect(factAuthorReextractRequestSchema.safeParse(request(count)).success).toBe(false);
  });

  it.each([
    ['an extra key', { ...request(1), extra: 1 }],
    ['a non-UUID org id', { ...request(1), orgId: 'org-1' }],
    ['a non-UUID fact id', { ...request(1), facts: [{ ...ref(1), factId: 'fact-1' }] }],
    ['a non-hex request id', { ...request(1), requestId: 'z'.repeat(64) }],
    ['a short request id', { ...request(1), requestId: 'a'.repeat(63) }],
    ['an empty storage key', { ...request(1), facts: [{ ...ref(1), s3Key: '' }] }],
    [
      'an over-long source kind',
      {
        ...request(1),
        facts: [{ ...ref(1), sourceKind: 'k'.repeat(FACT_AUTHOR_REEXTRACT_SOURCE_KIND_MAX + 1) }],
      },
    ],
    ['an extra fact key', { ...request(1), facts: [{ ...ref(1), body: 'text' }] }],
  ])('rejects %s', (_label, value) => {
    expect(factAuthorReextractRequestSchema.safeParse(value).success).toBe(false);
  });

  it('is accepted by the synthesis queue union', () => {
    expect(synthesisQueueRequestSchema.safeParse(request(1)).success).toBe(true);
    expect(
      synthesisQueueRequestSchema.safeParse({ ...request(1), type: 'fact_author_unknown' }).success,
    ).toBe(false);
  });
});

describe('fact authors result', () => {
  const FACT = '00000000-0000-4000-8000-000000000001';
  const result = (overrides: Record<string, unknown> = {}) => ({
    type: 'fact_authors' as const,
    requestId: 'b'.repeat(64),
    orgId: '123e4567-e89b-42d3-a456-426614174000',
    facts: [
      {
        factId: FACT,
        authors: [{ sourceUserId: '4242', role: 'author' as const, sourceLogin: 'octo-cat' }],
        unlinkedAuthors: [{ role: 'co_author' as const, displayName: 'Commit Author' }],
      },
    ],
    skipped: 0,
    ...overrides,
  });

  it('round-trips a canonical result', () => {
    expect(factAuthorsResultSchema.parse(result())).toEqual(result());
  });

  it('accepts a fact with no unlinked authors', () => {
    const value = result({ facts: [{ factId: FACT, authors: [] }] });
    expect(factAuthorsResultSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    [
      'an unknown author key',
      { facts: [{ factId: FACT, authors: [{ sourceUserId: '1', role: 'author', body: 'x' }] }] },
    ],
    ['an unknown fact key', { facts: [{ factId: FACT, authors: [], body: 'text' }] }],
    ['a non-UUID fact id', { facts: [{ factId: 'fact-1', authors: [] }] }],
    ['skipped over the cap', { skipped: FACT_AUTHOR_REEXTRACT_MAX_FACTS + 1 }],
    ['a negative skipped count', { skipped: -1 }],
    ['a fractional skipped count', { skipped: 1.5 }],
    ['a non-hex request id', { requestId: 'z'.repeat(64) }],
    [
      'more facts than a request can carry',
      {
        facts: Array.from({ length: FACT_AUTHOR_REEXTRACT_MAX_FACTS + 1 }, () => ({
          factId: FACT,
          authors: [],
        })),
      },
    ],
    [
      'more authors than a fact can carry',
      {
        facts: [
          {
            factId: FACT,
            authors: Array.from({ length: PROCESSED_FACT_MAX_AUTHORS + 1 }, (_, index) => ({
              sourceUserId: String(index + 1),
              role: 'author',
            })),
          },
        ],
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    expect(factAuthorsResultSchema.safeParse(result(overrides)).success).toBe(false);
  });

  it('accepts a result of exactly the byte cap and refuses one byte more, counted in UTF-8', () => {
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
    const nameOfBytes = (size: number) =>
      '\u00e9'.repeat(Math.floor(size / 2)) + 'a'.repeat(size % 2);
    const author = (size: number, index: number) => ({
      sourceUserId: String(index + 1),
      role: 'author' as const,
      displayName: nameOfBytes(size),
    });
    const MAX_NAME_BYTES = AUTHOR_DISPLAY_NAME_MAX * 2;
    const factId = (index: number) =>
      `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`;
    const build = (sizes: number[]) => {
      const facts: Array<{ factId: string; authors: ReturnType<typeof author>[] }> = [];
      sizes.forEach((size, index) => {
        let fact = facts.at(-1);
        if (!fact || fact.authors.length >= PROCESSED_FACT_MAX_AUTHORS) {
          fact = { factId: factId(facts.length), authors: [] };
          facts.push(fact);
        }
        fact.authors.push(author(size, index));
      });
      return result({ facts });
    };

    const sizes: number[] = [];
    const remaining = () => FACT_AUTHORS_RESULT_MAX_BYTES - bytes(build([...sizes, 1, 1]));
    while (remaining() > MAX_NAME_BYTES * 2) sizes.push(MAX_NAME_BYTES);
    const room = remaining() + 2;
    const first = Math.min(MAX_NAME_BYTES, Math.floor(room / 2));
    const atCap = build([...sizes, first, room - first]);

    expect(bytes(atCap)).toBe(FACT_AUTHORS_RESULT_MAX_BYTES);
    expect(factAuthorsResultSchema.safeParse(atCap).success).toBe(true);
    const over = build([...sizes, first, room - first + 1]);
    expect(bytes(over)).toBe(FACT_AUTHORS_RESULT_MAX_BYTES + 1);
    expect(factAuthorsResultSchema.safeParse(over).success).toBe(false);
    expect(JSON.stringify(atCap).length).toBeLessThan(FACT_AUTHORS_RESULT_MAX_BYTES);
  });
});

describe('GITHUB_ACCOUNT_ID_PATTERN', () => {
  it.each(['1', '42', '4242424242', '9'.repeat(16)])('accepts the numeric account id %s', (id) => {
    expect(GITHUB_ACCOUNT_ID_PATTERN.test(id)).toBe(true);
  });

  it.each(['', '0', '01', 'undefined', 'NaN', '-1', '1.5', '9'.repeat(17), ' 42', '4 2'])(
    'refuses %j',
    (id) => {
      expect(GITHUB_ACCOUNT_ID_PATTERN.test(id)).toBe(false);
    },
  );
});

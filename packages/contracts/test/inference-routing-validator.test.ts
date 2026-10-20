// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  INFERENCE_MODEL_CATALOG,
  INFERENCE_PROVIDER_IDS,
  PHALA_POLICY_CHECK_MODEL_ID,
  PHALA_POLICY_GENERATE_MODEL_ID,
  type InferenceModelCatalogEntry,
  type InferenceProviderId,
  type InferenceTrustClass,
} from '../src/inference-catalog.js';
import {
  COMPILED_DEFAULT_ROUTING,
  PAGE_CHECK_CONFIG_PURPOSES,
  PAGE_CONFIG_PURPOSES,
  inferencePurposeNeverFallsBack,
} from '../src/inference-routing-defaults.js';
import {
  INFERENCE_CHECK_PURPOSES,
  INFERENCE_PURPOSES,
  INFERENCE_PURPOSE_MIN_TRUST,
  INFERENCE_TENANT_TIERS,
  INFERENCE_TENANT_TIER_MIN_TRUST,
  INFERENCE_WRITING_PURPOSES,
  ROUTING_ALLOWED_PROCESSING_REGIONS,
  ROUTING_CLOCK_SKEW_MS,
  ROUTING_FALLBACKS_MAX,
  ROUTING_OVERRIDE_ORG_ID_SHA256S,
  ROUTING_TABLE_MAX_VALIDITY_MS,
  ROUTING_TABLE_REFUSALS,
  inferenceRoutingTableBodyV1Schema,
  type InferencePurpose,
  type PurposeRoute,
  type RoutingTableRefusal,
} from '../src/inference-routing.js';
import {
  mergedPurposeRoutes,
  routingTableBodyRefusal,
  type RoutingTableBodyContext,
} from '../src/inference-routing-validator.js';

const NOW_MS = 1_800_000_000_000;
const ALLOWED_ORG = ROUTING_OVERRIDE_ORG_ID_SHA256S[0]!;
const WIDE_REGIONS = ['us', 'unverified'] as const;
const OPUS = 'claude-opus-5-5';
const SONNET = 'claude-sonnet-5-5';
const HAIKU = 'claude-haiku-5-5';

const route = (
  model: string,
  provider: InferenceProviderId = 'anthropic',
  fallbacks: PurposeRoute['fallbacks'] = [],
  effort: PurposeRoute['effort'] = 'low',
): PurposeRoute => ({ provider, model, effort, fallbacks });

const target = (model: string, provider: InferenceProviderId = 'anthropic', effort = 'low') => ({
  provider,
  model,
  effort,
});

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 2,
    issuedAtMs: NOW_MS,
    notAfterMs: NOW_MS + ROUTING_TABLE_MAX_VALIDITY_MS,
    purposes: {},
    orgOverrides: [],
    ...overrides,
  };
}

function context(overrides: Partial<RoutingTableBodyContext> = {}): RoutingTableBodyContext {
  return {
    nowMs: NOW_MS,
    highWaterVersion: 0,
    routableProviders: new Set<InferenceProviderId>(['anthropic', 'phala']),
    ...overrides,
  };
}

function fixtureRow(overrides: Partial<InferenceModelCatalogEntry>): InferenceModelCatalogEntry {
  return {
    ...INFERENCE_MODEL_CATALOG[SONNET],
    ...overrides,
  } as InferenceModelCatalogEntry;
}

function catalogWith(rows: Record<string, InferenceModelCatalogEntry>) {
  return { ...INFERENCE_MODEL_CATALOG, ...rows };
}

function refusalFor(
  purposes: Record<string, unknown>,
  overrides: Partial<RoutingTableBodyContext> = {},
  extra: Record<string, unknown> = {},
): RoutingTableRefusal | undefined {
  return routingTableBodyRefusal(body({ purposes, ...extra }), context(overrides));
}

describe('routingTableBodyRefusal', () => {
  it('(1) refuses an extra key as schema_invalid', () => {
    expect(routingTableBodyRefusal(body({ extra: 1 }), context())).toBe(
      'routing_table_schema_invalid',
    );
  });

  it('(2) refuses a validity longer than 48 hours', () => {
    const notAfterMs = NOW_MS + ROUTING_TABLE_MAX_VALIDITY_MS + 1;
    expect(routingTableBodyRefusal(body({ notAfterMs }), context())).toBe(
      'routing_table_validity_too_long',
    );
  });

  it('(3) refuses a table issued more than the clock skew in the future', () => {
    const issuedAtMs = NOW_MS + ROUTING_CLOCK_SKEW_MS + 1_000;
    const notAfterMs = issuedAtMs + 1_000_000;
    expect(routingTableBodyRefusal(body({ issuedAtMs, notAfterMs }), context())).toBe(
      'routing_table_not_yet_valid',
    );
  });

  it('(4) refuses a table whose notAfterMs is now', () => {
    expect(routingTableBodyRefusal(body({ notAfterMs: NOW_MS }), context())).toBe(
      'routing_table_expired',
    );
  });

  it('(5, 6) refuses a replayed and a rolled-back version as version_not_newer', () => {
    expect(routingTableBodyRefusal(body({ version: 5 }), context({ highWaterVersion: 5 }))).toBe(
      'routing_table_version_not_newer',
    );
    expect(routingTableBodyRefusal(body({ version: 4 }), context({ highWaterVersion: 5 }))).toBe(
      'routing_table_version_not_newer',
    );
    expect(routingTableBodyRefusal(body({ version: 6 }), context({ highWaterVersion: 5 }))).toBe(
      undefined,
    );
  });

  it('(7) refuses an override for an org hash that is not on the list', () => {
    const orgOverrides = [{ orgIdSha256: 'a'.repeat(64), purposes: {} }];
    expect(routingTableBodyRefusal(body({ orgOverrides }), context())).toBe(
      'routing_table_override_org_not_allowed',
    );
  });

  it('(8) refuses the allowed org hash twice', () => {
    const orgOverrides = [
      { orgIdSha256: ALLOWED_ORG, purposes: {} },
      { orgIdSha256: ALLOWED_ORG, purposes: {} },
    ];
    expect(routingTableBodyRefusal(body({ orgOverrides }), context())).toBe(
      'routing_table_override_org_duplicate',
    );
  });

  it('(9) refuses a model that is not in the catalog', () => {
    expect(refusalFor({ answer: route('claude-opus-9') })).toBe('routing_table_model_unknown');
  });

  it('(10) refuses a catalog row that is not routable', () => {
    expect(refusalFor({ answer: route('qwen/qwen3-32b', 'phala') })).toBe(
      'routing_table_model_not_routable',
    );
  });

  it('(11) refuses a provider that differs from the catalog row', () => {
    expect(refusalFor({ answer: route(SONNET, 'phala') })).toBe('routing_table_provider_mismatch');
  });

  it('(12) refuses a provider the build does not enable', () => {
    const routableProviders = new Set<InferenceProviderId>(['anthropic']);
    const phalaRow = fixtureRow({
      provider: 'phala',
      weights: 'fixture/disabled',
      processingRegion: 'us',
    });
    expect(
      refusalFor(
        { answer: route('fixture/disabled', 'phala') },
        { routableProviders, catalog: catalogWith({ 'fixture/disabled': phalaRow }) },
      ),
    ).toBe('routing_table_provider_disabled');
  });

  it('(13) refuses an effort the row does not map', () => {
    const lowOnly = fixtureRow({ efforts: { low: 'low' }, weights: 'fixture/low-only' });
    expect(
      refusalFor(
        { answer: route('fixture/low-only', 'anthropic', [], 'high') },
        { catalog: catalogWith({ 'fixture/low-only': lowOnly }) },
      ),
    ).toBe('routing_table_effort_unsupported');
  });

  it('(14) refuses a purpose class the row has no timeout for', () => {
    expect(refusalFor({ wiki_revise: route(HAIKU) })).toBe(
      'routing_table_purpose_class_unsupported',
    );
  });

  it('(15) refuses a long purpose on a model with a long-context threshold', () => {
    expect(refusalFor({ wiki_section_long: route(HAIKU) })).toBe(
      'routing_table_long_purpose_capped',
    );
  });

  it('(15b) keeps a capped model off long purposes when its long-context tier is dropped', () => {
    const haikuWithoutTier = fixtureRow({
      ...INFERENCE_MODEL_CATALOG[HAIKU],
      longContext: null,
    });
    expect(
      refusalFor(
        { wiki_section_long: route(HAIKU) },
        { catalog: catalogWith({ [HAIKU]: haikuWithoutTier }) },
      ),
    ).toBe('routing_table_long_purpose_capped');
  });

  it('(15c) allows a long purpose on an uncapped model with a long-context tier', () => {
    const tiered = fixtureRow({
      longContext: INFERENCE_MODEL_CATALOG[HAIKU].longContext,
      longPurposeCapped: false,
    });
    expect(
      refusalFor(
        { wiki_section_long: route(SONNET) },
        { catalog: catalogWith({ [SONNET]: tiered }) },
      ),
    ).toBeUndefined();
  });

  it('(15d) never lets a writer, check, page or page-check config purpose fall back', () => {
    for (const purpose of INFERENCE_PURPOSES) {
      const expected =
        INFERENCE_WRITING_PURPOSES.has(purpose) ||
        INFERENCE_CHECK_PURPOSES.includes(purpose as (typeof INFERENCE_CHECK_PURPOSES)[number]) ||
        PAGE_CONFIG_PURPOSES.includes(purpose) ||
        PAGE_CHECK_CONFIG_PURPOSES.includes(purpose);
      expect(inferencePurposeNeverFallsBack(purpose), purpose).toBe(expected);
    }
    for (const purpose of PAGE_CHECK_CONFIG_PURPOSES) {
      expect(inferencePurposeNeverFallsBack(purpose), purpose).toBe(true);
    }
  });

  it('(16) refuses a target below a purpose floor', () => {
    const purposeFloors = { ...INFERENCE_PURPOSE_MIN_TRUST, answer: 'attested' as const };
    expect(refusalFor({ answer: route(SONNET) }, { purposeFloors })).toBe(
      'routing_table_trust_below_floor',
    );
  });

  it('(17) refuses a fallback on another provider at a lower class', () => {
    expect(
      refusalFor(
        { answer: route(PHALA_POLICY_GENERATE_MODEL_ID, 'phala', [target(SONNET)], 'medium') },
        { allowedProcessingRegions: WIDE_REGIONS },
      ),
    ).toBe('routing_table_fallback_trust_downgrade');
  });

  it('(18) refuses a fallback equal to the primary', () => {
    expect(refusalFor({ answer: route(SONNET, 'anthropic', [target(SONNET)]) })).toBe(
      'routing_table_fallback_duplicate',
    );
  });

  it('(19) refuses a checker on the weights a writer uses', () => {
    expect(refusalFor({ wiki_review: route(SONNET) })).toBe('routing_table_checker_shares_writer');
  });

  it('(20) refuses a writer on the weights a checker uses', () => {
    expect(refusalFor({ wiki_section: route(OPUS) })).toBe('routing_table_checker_shares_writer');
  });

  it('(21) refuses an allowed override that moves a checker onto a writer', () => {
    const orgOverrides = [{ orgIdSha256: ALLOWED_ORG, purposes: { wiki_critique: route(SONNET) } }];
    expect(routingTableBodyRefusal(body({ orgOverrides }), context())).toBe(
      'routing_table_checker_shares_writer',
    );
  });

  it('(22) refuses Phala under the default regions', () => {
    expect(
      refusalFor({ answer: route(PHALA_POLICY_GENERATE_MODEL_ID, 'phala', [], 'medium') }),
    ).toBe('routing_table_region_not_allowed');
  });

  it('(23) refuses the generate pseudo-id on a check purpose', () => {
    expect(
      refusalFor(
        { wiki_review: route(PHALA_POLICY_GENERATE_MODEL_ID, 'phala', [], 'medium') },
        { allowedProcessingRegions: WIDE_REGIONS },
      ),
    ).toBe('routing_table_phala_role_mismatch');
    expect(
      refusalFor(
        { answer: route(PHALA_POLICY_CHECK_MODEL_ID, 'phala', [], 'medium') },
        { allowedProcessingRegions: WIDE_REGIONS },
      ),
    ).toBe('routing_table_phala_role_mismatch');
  });

  it('(24) refuses any fallback on a writing purpose and on every page purpose', () => {
    expect(
      refusalFor({ wiki_section: route(SONNET, 'anthropic', [target(OPUS, 'anthropic')]) }),
    ).toBe('routing_table_fallback_not_allowed');
    for (const purpose of [...PAGE_CONFIG_PURPOSES, ...PAGE_CHECK_CONFIG_PURPOSES]) {
      expect(
        refusalFor({ [purpose]: route(SONNET, 'anthropic', [target(OPUS, 'anthropic')]) }),
        purpose,
      ).toBe('routing_table_fallback_not_allowed');
    }
    for (const purpose of INFERENCE_WRITING_PURPOSES) {
      expect(
        refusalFor({ [purpose]: route(SONNET, 'anthropic', [target(OPUS, 'anthropic')]) }),
        purpose,
      ).toBe('routing_table_fallback_not_allowed');
    }
  });

  it('(24b) refuses any fallback on a check purpose', () => {
    for (const purpose of INFERENCE_CHECK_PURPOSES) {
      expect(
        refusalFor({ [purpose]: route(OPUS, 'anthropic', [target(HAIKU, 'anthropic')]) }),
        purpose,
      ).toBe('routing_table_fallback_not_allowed');
    }
  });

  it('(25) refuses a cross-provider fallback onto a fixture row of the same class', () => {
    const sameClass = fixtureRow({
      provider: 'phala',
      weights: 'fixture/contractual',
      trustClass: 'contractual',
      processingRegion: 'us',
    });
    expect(
      refusalFor(
        { answer: route(SONNET, 'anthropic', [target('fixture/contractual', 'phala', 'low')]) },
        { catalog: catalogWith({ 'fixture/contractual': sameClass }) },
      ),
    ).toBe('routing_table_fallback_trust_downgrade');
  });

  it('(26) accepts a cross-provider fallback onto a strictly higher class', () => {
    const higher = fixtureRow({
      provider: 'phala',
      weights: 'fixture/zdr',
      trustClass: 'contractual_zdr',
      processingRegion: 'us',
    });
    expect(
      refusalFor(
        { answer: route(SONNET, 'anthropic', [target('fixture/zdr', 'phala', 'low')]) },
        { catalog: catalogWith({ 'fixture/zdr': higher }) },
      ),
    ).toBeUndefined();
  });

  it('(27) accepts a same-provider fallback on other weights and refuses a checker weight', () => {
    expect(
      refusalFor({ theme_tagging: route(HAIKU, 'anthropic', [target(SONNET)]) }),
    ).toBeUndefined();
    expect(refusalFor({ theme_tagging: route(HAIKU, 'anthropic', [target(OPUS)]) })).toBe(
      'routing_table_checker_shares_writer',
    );
  });

  it('(27b) refuses each page and article writer that shares weights with a checker', () => {
    for (const purpose of ['wiki_page_revise', 'wiki_article_long', 'team_onboarding_long']) {
      expect(refusalFor({ [purpose]: route(OPUS) }), purpose).toBe(
        'routing_table_checker_shares_writer',
      );
    }
  });

  it('(27c) refuses a page or article check on the weights of a writer it always reads', () => {
    expect(refusalFor({ wiki_page_check: route(SONNET) })).toBe(
      'routing_table_checker_shares_writer',
    );
    expect(refusalFor({ wiki_article_check: route(SONNET) })).toBe(
      'routing_table_checker_shares_writer',
    );
  });

  it('(27d) accepts a page check on the weights of a writer it reads only conditionally', () => {
    const delta = { wiki_delta: route(HAIKU) };
    expect(refusalFor({ wiki_page_check: route(HAIKU), ...delta })).toBeUndefined();
    expect(refusalFor({ wiki_review: route(HAIKU), ...delta })).toBe(
      'routing_table_checker_shares_writer',
    );
  });

  it('(27e) lets the critique and not the review read the recovery route', () => {
    expect(refusalFor({ wiki_critique: route(HAIKU) })).toBe('routing_table_checker_shares_writer');
    expect(refusalFor({ wiki_review: route(HAIKU) })).toBeUndefined();
    expect(refusalFor({ wiki_article_check: route(HAIKU) })).toBeUndefined();
  });

  it('(28) refuses a writer whose weights a Phala check pseudo-id may resolve to', () => {
    const kimiWriter = fixtureRow({
      weights: 'moonshotai/kimi-k3',
      processingRegion: 'us',
    });
    expect(
      refusalFor(
        {
          wiki_section: route('fixture/kimi-writer', 'anthropic', [], 'low'),
          wiki_review: route(PHALA_POLICY_CHECK_MODEL_ID, 'phala', [], 'medium'),
        },
        {
          allowedProcessingRegions: WIDE_REGIONS,
          catalog: catalogWith({ 'fixture/kimi-writer': kimiWriter }),
        },
      ),
    ).toBe('routing_table_checker_shares_writer');
  });

  it('(29) accepts a full Phala revert when the regions are widened', () => {
    const purposes = Object.fromEntries(
      INFERENCE_PURPOSES.map((purpose) => {
        const model = (INFERENCE_CHECK_PURPOSES as readonly InferencePurpose[]).includes(purpose)
          ? PHALA_POLICY_CHECK_MODEL_ID
          : PHALA_POLICY_GENERATE_MODEL_ID;
        return [purpose, route(model, 'phala', [], 'medium')];
      }),
    );
    expect(refusalFor(purposes, { allowedProcessingRegions: WIDE_REGIONS })).toBeUndefined();
    expect(refusalFor(purposes)).toBe('routing_table_region_not_allowed');
  });

  it('(30) refuses prototype-named models and purpose keys', () => {
    for (const model of ['__proto__', 'constructor', 'toString']) {
      expect(refusalFor({ answer: route(model) }), model).toBe('routing_table_model_unknown');
      const purposes = JSON.parse(
        `{"${model}": {"provider":"anthropic","model":"${SONNET}","effort":"low","fallbacks":[]}}`,
      );
      expect(refusalFor(purposes), model).toBe('routing_table_schema_invalid');
    }
  });

  it('(31) passes the compiled default under the floor of every tier', () => {
    const version = Math.floor(NOW_MS / 1000);
    const purposes = Object.fromEntries(
      INFERENCE_PURPOSES.map((purpose) => {
        const { provider, model, effort } = COMPILED_DEFAULT_ROUTING.purposes[purpose];
        return [purpose, { provider, model, effort, fallbacks: [] }];
      }),
    );
    for (const tier of INFERENCE_TENANT_TIERS) {
      const floor = INFERENCE_TENANT_TIER_MIN_TRUST[tier];
      const purposeFloors = Object.fromEntries(
        INFERENCE_PURPOSES.map((purpose) => [purpose, floor]),
      ) as Record<InferencePurpose, InferenceTrustClass>;
      expect(
        routingTableBodyRefusal(body({ version, purposes }), context({ purposeFloors })),
        tier,
      ).toBeUndefined();
    }
  });

  it('(32) refuses a version past the clock and accepts one equal to it', () => {
    const seconds = Math.floor(NOW_MS / 1000);
    expect(routingTableBodyRefusal(body({ version: seconds + 1 }), context())).toBe(
      'routing_table_version_ahead_of_clock',
    );
    expect(routingTableBodyRefusal(body({ version: seconds }), context())).toBeUndefined();
  });

  it('accepts an empty table', () => {
    expect(routingTableBodyRefusal(body(), context())).toBeUndefined();
  });

  it('accepts Phala for a non-check purpose and a higher-class fallback with widened regions', () => {
    const regions = { allowedProcessingRegions: WIDE_REGIONS };
    expect(
      refusalFor(
        { wiki_outline: route(PHALA_POLICY_GENERATE_MODEL_ID, 'phala', [], 'medium') },
        regions,
      ),
    ).toBeUndefined();
    expect(
      refusalFor(
        {
          answer: route(OPUS, 'anthropic', [
            target(PHALA_POLICY_GENERATE_MODEL_ID, 'phala', 'medium'),
          ]),
        },
        regions,
      ),
    ).toBeUndefined();
  });

  it('checks every refusal code against the exported list', () => {
    for (const code of ROUTING_TABLE_REFUSALS) expect(code).toMatch(/^routing_table_[a-z_]+$/);
    expect(ROUTING_TABLE_REFUSALS).toContain('routing_table_version_ahead_of_clock');
    expect(ROUTING_ALLOWED_PROCESSING_REGIONS).toEqual(['us']);
    expect(ROUTING_FALLBACKS_MAX).toBe(2);
    expect(INFERENCE_PROVIDER_IDS).toContain('phala');
  });
});

describe('mergedPurposeRoutes', () => {
  const tableBody = (purposes: Record<string, unknown>, overrides: unknown[] = []) =>
    inferenceRoutingTableBodyV1Schema.parse(body({ purposes, orgOverrides: overrides }));

  it('returns the compiled default with no fallbacks when there is no table', () => {
    const merged = mergedPurposeRoutes(undefined, undefined);
    for (const purpose of INFERENCE_PURPOSES) {
      const { provider, model, effort } = COMPILED_DEFAULT_ROUTING.purposes[purpose];
      expect(merged[purpose]).toEqual({ provider, model, effort, fallbacks: [] });
    }
  });

  it('lets table entries replace the default', () => {
    const merged = mergedPurposeRoutes(
      tableBody({ answer: route(OPUS, 'anthropic', [], 'high') }),
      undefined,
    );
    expect(merged.answer.model).toBe(OPUS);
    expect(merged.wiki_section.model).toBe(SONNET);
  });

  it('lets the matching override replace on top and ignores other hashes', () => {
    const table = tableBody({ answer: route(OPUS) }, [
      { orgIdSha256: ALLOWED_ORG, purposes: { answer: route(HAIKU) } },
    ]);
    expect(mergedPurposeRoutes(table, ALLOWED_ORG).answer.model).toBe(HAIKU);
    expect(mergedPurposeRoutes(table, 'b'.repeat(64)).answer.model).toBe(OPUS);
    expect(mergedPurposeRoutes(table, undefined).answer.model).toBe(OPUS);
  });
});

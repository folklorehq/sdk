// SPDX-License-Identifier: Apache-2.0
import {
  INFERENCE_MODEL_CATALOG,
  PHALA_POLICY_CHECK_MODEL_ID,
  PHALA_POLICY_GENERATE_MODEL_ID,
  PHALA_POLICY_PSEUDO_MODEL_IDS,
  trustRank,
  type InferenceModelCatalogEntry,
  type InferenceProcessingRegion,
  type InferenceProviderId,
  type InferenceTrustClass,
} from './inference-catalog.js';
import {
  COMPILED_DEFAULT_ROUTING,
  inferencePurposeNeverFallsBack,
  type CompiledRouting,
} from './inference-routing-defaults.js';
import {
  INFERENCE_CHECKER_RULES,
  INFERENCE_CHECK_PURPOSES,
  INFERENCE_LONG_PURPOSES,
  INFERENCE_PURPOSES,
  inferenceTimeoutMs,
  INFERENCE_PURPOSE_MIN_TRUST,
  INFERENCE_TENANT_TIER_MIN_TRUST,
  isInferenceCheckPurpose,
  ROUTING_ALLOWED_PROCESSING_REGIONS,
  ROUTING_CLOCK_SKEW_MS,
  ROUTING_OVERRIDE_ORG_ID_SHA256S,
  ROUTING_TABLE_MAX_VALIDITY_MS,
  inferenceRoutingTableBodyV1Schema,
  type InferenceCheckerRule,
  type InferenceRoutingTableBodyV1,
  type InferencePurpose,
  type PurposeRoute,
  type RouteTarget,
  type RoutingTableRefusal,
} from './inference-routing.js';

type Catalog = Readonly<Record<string, InferenceModelCatalogEntry>>;
type PurposeRoutes = Readonly<Record<InferencePurpose, PurposeRoute>>;

const MS_PER_SECOND = 1000;
const UNKNOWN_WEIGHTS_PREFIX = 'unknown:';

export interface RoutingTableBodyContext {
  readonly nowMs: number;
  readonly highWaterVersion: number;
  readonly routableProviders: ReadonlySet<InferenceProviderId>;
  readonly catalog?: Catalog;
  readonly purposeFloors?: Readonly<Record<InferencePurpose, InferenceTrustClass>>;
  readonly allowedProcessingRegions?: readonly InferenceProcessingRegion[];
}

interface ResolvedTarget {
  readonly model: string;
  readonly weights: string;
}

const NO_FALLBACKS: readonly RouteTarget[] = Object.freeze([]);
const NO_PURPOSES: ReadonlySet<InferencePurpose> = new Set();

export function mergedPurposeRoutes(
  table: InferenceRoutingTableBodyV1 | undefined,
  orgIdSha256: string | undefined,
  compiled: CompiledRouting = COMPILED_DEFAULT_ROUTING,
): PurposeRoutes {
  const override =
    table === undefined || orgIdSha256 === undefined
      ? undefined
      : table.orgOverrides.find((candidate) => candidate.orgIdSha256 === orgIdSha256);
  const entries = INFERENCE_PURPOSES.map((purpose) => {
    const route =
      pickRoute(override?.purposes, purpose) ??
      pickRoute(table?.purposes, purpose) ??
      compiledRoute(compiled, purpose);
    return [purpose, route] as const;
  });
  return Object.fromEntries(entries) as PurposeRoutes;
}

function pickRoute(
  purposes: Partial<Record<InferencePurpose, PurposeRoute>> | undefined,
  purpose: InferencePurpose,
): PurposeRoute | undefined {
  if (purposes === undefined || !Object.hasOwn(purposes, purpose)) return undefined;
  return purposes[purpose];
}

function compiledRoute(compiled: CompiledRouting, purpose: InferencePurpose): PurposeRoute {
  const { provider, model, effort } = compiled.purposes[purpose];
  return { provider, model, effort, fallbacks: [...NO_FALLBACKS] };
}

export function routingTableBodyRefusal(
  body: unknown,
  context: RoutingTableBodyContext,
): RoutingTableRefusal | undefined {
  return new RoutingTableBodyValidator(context).refusal(body);
}

class RoutingTableBodyValidator {
  readonly #context: RoutingTableBodyContext;
  readonly #catalog: Catalog;
  readonly #regions: readonly InferenceProcessingRegion[];
  readonly #tierFloorRank: number;

  constructor(context: RoutingTableBodyContext) {
    this.#context = context;
    this.#catalog = context.catalog ?? INFERENCE_MODEL_CATALOG;
    this.#regions = context.allowedProcessingRegions ?? ROUTING_ALLOWED_PROCESSING_REGIONS;
    this.#tierFloorRank = Math.max(
      ...Object.values(INFERENCE_TENANT_TIER_MIN_TRUST).map(trustRank),
    );
  }

  refusal(input: unknown): RoutingTableRefusal | undefined {
    const parsed = inferenceRoutingTableBodyV1Schema.safeParse(input);
    if (!parsed.success) return 'routing_table_schema_invalid';
    const body = parsed.data;
    return (
      this.timeRefusal(body) ??
      this.overrideRefusal(body) ??
      this.routesRefusal(body.purposes) ??
      this.overridesRoutesRefusal(body) ??
      this.separationRefusal(body)
    );
  }

  private timeRefusal(body: InferenceRoutingTableBodyV1): RoutingTableRefusal | undefined {
    const { nowMs, highWaterVersion } = this.#context;
    if (body.notAfterMs - body.issuedAtMs > ROUTING_TABLE_MAX_VALIDITY_MS) {
      return 'routing_table_validity_too_long';
    }
    if (body.issuedAtMs > nowMs + ROUTING_CLOCK_SKEW_MS) return 'routing_table_not_yet_valid';
    if (body.notAfterMs <= nowMs) return 'routing_table_expired';
    if (body.version > Math.floor(body.issuedAtMs / MS_PER_SECOND)) {
      return 'routing_table_version_ahead_of_clock';
    }
    if (body.version <= highWaterVersion) return 'routing_table_version_not_newer';
    return undefined;
  }

  private overrideRefusal(body: InferenceRoutingTableBodyV1): RoutingTableRefusal | undefined {
    const seen = new Set<string>();
    for (const { orgIdSha256 } of body.orgOverrides) {
      if (!ROUTING_OVERRIDE_ORG_ID_SHA256S.includes(orgIdSha256)) {
        return 'routing_table_override_org_not_allowed';
      }
      if (seen.has(orgIdSha256)) return 'routing_table_override_org_duplicate';
      seen.add(orgIdSha256);
    }
    return undefined;
  }

  private overridesRoutesRefusal(
    body: InferenceRoutingTableBodyV1,
  ): RoutingTableRefusal | undefined {
    for (const override of body.orgOverrides) {
      const refusal = this.routesRefusal(override.purposes);
      if (refusal !== undefined) return refusal;
    }
    return undefined;
  }

  private routesRefusal(
    purposes: Partial<Record<InferencePurpose, PurposeRoute>>,
  ): RoutingTableRefusal | undefined {
    for (const purpose of INFERENCE_PURPOSES) {
      const route = pickRoute(purposes, purpose);
      if (route === undefined) continue;
      const refusal = this.routeRefusal(purpose, route);
      if (refusal !== undefined) return refusal;
    }
    return undefined;
  }

  private routeRefusal(
    purpose: InferencePurpose,
    route: PurposeRoute,
  ): RoutingTableRefusal | undefined {
    const targets = [route, ...route.fallbacks];
    for (const target of targets) {
      const refusal = this.targetRefusal(purpose, target);
      if (refusal !== undefined) return refusal;
    }
    return this.fallbackRefusal(purpose, route);
  }

  private targetRefusal(
    purpose: InferencePurpose,
    target: RouteTarget,
  ): RoutingTableRefusal | undefined {
    const entry = this.entryOf(target.model);
    if (entry === undefined) return 'routing_table_model_unknown';
    if (!entry.routable) return 'routing_table_model_not_routable';
    if (entry.provider !== target.provider) return 'routing_table_provider_mismatch';
    if (!this.#context.routableProviders.has(target.provider)) {
      return 'routing_table_provider_disabled';
    }
    if (!Object.hasOwn(entry.efforts, target.effort)) return 'routing_table_effort_unsupported';
    if (inferenceTimeoutMs(entry, purpose) === undefined) {
      return 'routing_table_purpose_class_unsupported';
    }
    if (!this.#regions.includes(entry.processingRegion)) return 'routing_table_region_not_allowed';
    if (!this.phalaRoleMatches(target.model, purpose)) return 'routing_table_phala_role_mismatch';
    if (INFERENCE_LONG_PURPOSES.has(purpose) && entry.longPurposeCapped) {
      return 'routing_table_long_purpose_capped';
    }
    if (trustRank(entry.trustClass) < this.floorRank(purpose)) {
      return 'routing_table_trust_below_floor';
    }
    return undefined;
  }

  private entryOf(model: string): InferenceModelCatalogEntry | undefined {
    return Object.hasOwn(this.#catalog, model) ? this.#catalog[model] : undefined;
  }

  private floorRank(purpose: InferencePurpose): number {
    const floors = this.#context.purposeFloors ?? INFERENCE_PURPOSE_MIN_TRUST;
    return Math.max(trustRank(floors[purpose]), this.#tierFloorRank);
  }

  private fallbackRefusal(
    purpose: InferencePurpose,
    route: PurposeRoute,
  ): RoutingTableRefusal | undefined {
    if (route.fallbacks.length === 0) return undefined;
    if (inferencePurposeNeverFallsBack(purpose)) return 'routing_table_fallback_not_allowed';
    const downgrade = route.fallbacks.some((fallback) => this.isTrustDowngrade(route, fallback));
    if (downgrade) return 'routing_table_fallback_trust_downgrade';
    return this.hasDuplicateTarget(route) ? 'routing_table_fallback_duplicate' : undefined;
  }

  private isTrustDowngrade(primary: RouteTarget, fallback: RouteTarget): boolean {
    const primaryRank = this.rankOf(primary.model);
    const fallbackRank = this.rankOf(fallback.model);
    return fallback.provider === primary.provider
      ? fallbackRank < primaryRank
      : fallbackRank <= primaryRank;
  }

  private separationRefusal(body: InferenceRoutingTableBodyV1): RoutingTableRefusal | undefined {
    const views = [
      mergedPurposeRoutes(body, undefined),
      ...body.orgOverrides.map(({ orgIdSha256 }) => mergedPurposeRoutes(body, orgIdSha256)),
    ];
    return views.some((view) => this.viewSharesWeights(view))
      ? 'routing_table_checker_shares_writer'
      : undefined;
  }

  private viewSharesWeights(view: PurposeRoutes): boolean {
    const fallbacks = INFERENCE_PURPOSES.flatMap((purpose) =>
      view[purpose].fallbacks.map((target) => this.resolveTarget(target)),
    );
    const phalaWeights = this.phalaRoleWeights();
    return INFERENCE_CHECK_PURPOSES.some((checker) => {
      const own = this.resolved(view[checker]);
      const reads = [...this.staticReads(INFERENCE_CHECKER_RULES[checker])].flatMap((purpose) =>
        this.resolved(view[purpose]),
      );
      return [...reads, ...fallbacks].some((left) =>
        own.some((right) => this.weightsConflict(left, right, phalaWeights)),
      );
    });
  }

  private staticReads(rule: InferenceCheckerRule): ReadonlySet<InferencePurpose> {
    if (rule.fallback === undefined) return rule.reads;
    return rule.alwaysReads ?? NO_PURPOSES;
  }

  private rankOf(model: string): number {
    const entry = this.entryOf(model);
    return entry === undefined ? -1 : trustRank(entry.trustClass);
  }

  private resolved(route: PurposeRoute): ResolvedTarget[] {
    return [route, ...route.fallbacks].map((target) => this.resolveTarget(target));
  }

  private resolveTarget(target: RouteTarget): ResolvedTarget {
    const weights =
      this.entryOf(target.model)?.weights ?? `${UNKNOWN_WEIGHTS_PREFIX}${target.model}`;
    return { model: target.model, weights };
  }

  private phalaRoleWeights(): ReadonlySet<string> {
    return new Set(
      Object.entries(this.#catalog)
        .filter(([id, entry]) => entry.provider === 'phala' && !this.isPhalaPseudoId(id))
        .map(([, entry]) => entry.weights),
    );
  }

  private isPhalaPseudoId(model: string): boolean {
    return (PHALA_POLICY_PSEUDO_MODEL_IDS as readonly string[]).includes(model);
  }

  private phalaRoleMatches(model: string, purpose: InferencePurpose): boolean {
    if (!this.isPhalaPseudoId(model)) return true;
    const isCheck = isInferenceCheckPurpose(purpose);
    return model === (isCheck ? PHALA_POLICY_CHECK_MODEL_ID : PHALA_POLICY_GENERATE_MODEL_ID);
  }

  private hasDuplicateTarget(route: PurposeRoute): boolean {
    const keys = [route, ...route.fallbacks].map(
      (target) => `${target.provider}\u0000${target.model}\u0000${target.effort}`,
    );
    return new Set(keys).size !== keys.length;
  }

  private weightsConflict(
    left: ResolvedTarget,
    right: ResolvedTarget,
    phalaRoleWeights: ReadonlySet<string>,
  ): boolean {
    if (left.weights === right.weights) return true;
    const leftPseudo = this.isPhalaPseudoId(left.model);
    const rightPseudo = this.isPhalaPseudoId(right.model);
    if (leftPseudo === rightPseudo) return false;
    const real = leftPseudo ? right : left;
    return phalaRoleWeights.has(real.weights);
  }
}

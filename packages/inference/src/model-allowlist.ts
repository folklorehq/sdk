// SPDX-License-Identifier: Apache-2.0
// The confirmed TEE-verified confidential models on inference.phala.com — each was
// checked live to return `upstream.verified: {result: verified, required: true}` (ADL
// #30/#40). The gateway serves verified AND routed (non-TEE) models on one endpoint, so
// sending customer plaintext to any model NOT on this list would leak it. Treat as the
// fail-closed default; override only after live-verifying a model's attestation.
export const DEFAULT_VERIFIED_MODELS = [
  'moonshotai/kimi-k3',
  'z-ai/glm-5.3',
  'z-ai/glm-5.2',
  'qwen/qwen3-32b',
  'qwen/qwen3-embedding-8b',
] as const;

// An empty/unset value falls back to the verified default rather than an empty
// allowlist: a config typo must not silently disable inference, and must never widen
// the guard. An explicit non-empty list overrides the default verbatim.
export function parseModelAllowlist(
  raw: string | undefined,
  fallback: readonly string[] = DEFAULT_VERIFIED_MODELS,
): readonly string[] {
  if (raw === undefined) return fallback;
  const models = raw
    .split(',')
    .map((model) => model.trim())
    .filter((model) => model.length > 0);
  return models.length > 0 ? models : fallback;
}

export type ReasoningEffort = 'low' | 'high' | 'max';

export type ReasoningEffortCall = 'generate' | 'structured';

// Reasoning tokens count against max_tokens; at the model's default effort they can exhaust the cap.
export const REASONING_EFFORT_BY_MODEL: ReadonlyMap<
  string,
  Readonly<Partial<Record<ReasoningEffortCall, ReasoningEffort>>>
> = new Map([
  ['z-ai/glm-5.3', { generate: 'low' }],
  ['moonshotai/kimi-k3', { generate: 'low', structured: 'low' }],
]);

// Matched by prefix so a renamed variant of a reasoning model cannot silently run at default effort.
const REASONING_MODEL_FAMILIES = ['z-ai/glm-5.3', 'moonshotai/kimi-k3'] as const;

export function reasoningEffortFor(
  model: string,
  call: ReasoningEffortCall,
): ReasoningEffort | undefined {
  return REASONING_EFFORT_BY_MODEL.get(model)?.[call];
}

export function reasoningModelsMissingEffort(models: readonly string[]): string[] {
  return models.filter(
    (model) =>
      REASONING_MODEL_FAMILIES.some((family) => model.startsWith(family)) &&
      !REASONING_EFFORT_BY_MODEL.has(model),
  );
}

// The public session's canonical_model_id; each receipt-captured entry below equals its own.
const KIMI_K3_ATTESTED_UPSTREAM_MODEL_ID = 'moonshotai/Kimi-K3-TEE';

// Read from a live receipt's upstream event; the session carries no canonical_model_id.
const GLM_5_3_ATTESTED_UPSTREAM_MODEL_ID = 'glm-5-3';

// Phala receipts name the attested upstream in provider naming, not the gateway alias; exact only.
const ATTESTED_UPSTREAM_MODEL_IDS: ReadonlyMap<string, string> = new Map([
  ['moonshotai/kimi-k3', KIMI_K3_ATTESTED_UPSTREAM_MODEL_ID],
  ['z-ai/glm-5.3', GLM_5_3_ATTESTED_UPSTREAM_MODEL_ID],
  ['z-ai/glm-5.2', 'zai-org/GLM-5.2-TEE'],
  ['qwen/qwen3-32b', 'Qwen/Qwen3-32B-TEE'],
  ['qwen/qwen3-embedding-8b', 'Qwen/Qwen3-Embedding-8B-TEE'],
]);

/** An unmapped alias has no attested upstream, so it matches no receipt event. */
export function attestedUpstreamModelId(alias: string): string | undefined {
  return ATTESTED_UPSTREAM_MODEL_IDS.get(alias);
}

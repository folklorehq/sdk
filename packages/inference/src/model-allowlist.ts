// SPDX-License-Identifier: Apache-2.0
// The confirmed TEE-verified confidential models on inference.phala.com — each was
// checked live to return `upstream.verified: {result: verified, required: true}` (ADL
// #30/#40). The gateway serves verified AND routed (non-TEE) models on one endpoint, so
// sending customer plaintext to any model NOT on this list would leak it. Treat as the
// fail-closed default; override only after live-verifying a model's attestation.
export const DEFAULT_VERIFIED_MODELS = [
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

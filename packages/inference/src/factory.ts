// SPDX-License-Identifier: Apache-2.0
import type { TelemetryClient } from '@folklore/telemetry';
import type { InferenceBackend, InferenceResponseVerifier } from './ports.js';
import { TeeEndpointBackend } from './TeeEndpointBackend.js';
import { OpenAICompatBackend } from './OpenAICompatBackend.js';
import { StubInferenceBackend } from './StubInferenceBackend.js';
import { AciReceiptVerifier } from './aci-verifier.js';
import type { InferenceTrustPolicyV1 } from '@folklore/contracts';

/** How inference is executed; no external/unattested API option and no local model runtime in prod. */
export type InferenceMode =
  | 'local-openai'
  | 'phala-endpoint'
  | 'folklore-tee'
  | 'stub'
  | 'disabled';

export const TEE_COMMISSIONING_PREREQUISITE =
  'inference commissioning prerequisite unmet: TEE inference requires an offline-signed trust policy and a mandatory ACI response verifier';

export interface InferenceConfig {
  /** Inference mode. Required to be explicit — an unset mode throws rather than silently degrading. */
  mode?: InferenceMode;

  embedModel?: string;
  generateModel?: string;

  // Remote TEE endpoint config (mode: 'phala-endpoint' or 'folklore-tee').
  teeEndpointUrl?: string;
  teeApiKey?: string;

  // Local OpenAI-compatible server config (mode: 'local-openai' — vLLM / TGI / llama.cpp).
  openaiBaseUrl?: string;
  openaiApiKey?: string;

  telemetry?: TelemetryClient;

  /** Offline-authorized policy that pins the endpoint, workload, measurements, and receipt keys. */
  inferenceTrustPolicy?: InferenceTrustPolicyV1;

  /** Fetch bound to the offline-authorized inference TLS pins. */
  fetchImpl?: typeof fetch;

  /** Additional allowlist for non-TEE config consumers; TEE models come from the signed policy. */
  modelAllowlist?: readonly string[];
}

export function createInferenceBackend(config: InferenceConfig): InferenceBackend {
  const mode = config.mode;
  if (mode === undefined) {
    throw new Error(
      'inference mode is not configured: set an explicit mode ' +
        '(disabled | stub | local-openai | phala-endpoint | folklore-tee).',
    );
  }

  switch (mode) {
    case 'disabled':
      throw new Error('worker inference is disabled because content inference is enclave-only');

    case 'stub':
      return new StubInferenceBackend();

    case 'local-openai': {
      if (!config.openaiBaseUrl) {
        throw new Error(
          `inference mode "local-openai" requires openaiBaseUrl to be set. ` +
            `Set DEV_THEME_OPENAI_COMPAT_BASE_URL (e.g. http://vllm:8000/v1) in the environment or inference config.`,
        );
      }
      // In-box-trust path: no allowlist / ACI receipt verifier — those pin Phala model names + attestation a local vLLM can't satisfy.
      return new OpenAICompatBackend({
        baseUrl: config.openaiBaseUrl,
        apiKey: config.openaiApiKey,
        embedModel: config.embedModel,
        generateModel: config.generateModel,
        telemetry: config.telemetry,
      });
    }

    case 'phala-endpoint':
    case 'folklore-tee': {
      if (!config.teeEndpointUrl) {
        throw new Error(
          `inference mode "${mode}" requires teeEndpointUrl to be set. ` +
            `Set TEE_ENDPOINT_URL in the environment or inference config.`,
        );
      }
      return new TeeEndpointBackend({
        baseUrl: config.teeEndpointUrl,
        apiKey: config.teeApiKey,
        trustPolicy: requireTrustPolicy(config),
        responseVerifier: buildReceiptVerifier(config),
        telemetry: config.telemetry,
        fetchImpl: requirePinnedFetch(config),
      });
    }

    default:
      return assertUnreachableMode(mode);
  }
}

function buildReceiptVerifier(config: InferenceConfig): InferenceResponseVerifier {
  if (!config.teeEndpointUrl || !config.inferenceTrustPolicy) {
    throw new Error(TEE_COMMISSIONING_PREREQUISITE);
  }
  return new AciReceiptVerifier({
    baseUrl: config.teeEndpointUrl,
    trustPolicy: config.inferenceTrustPolicy,
    apiKey: config.teeApiKey,
    telemetry: config.telemetry,
    policy: 'per-call',
    fetchImpl: requirePinnedFetch(config),
  });
}

function requirePinnedFetch(config: InferenceConfig): typeof fetch {
  if (!config.fetchImpl)
    throw new Error('inference commissioning prerequisite unmet: pinned transport is required');
  return config.fetchImpl;
}

function requireTrustPolicy(config: InferenceConfig): InferenceTrustPolicyV1 {
  if (!config.inferenceTrustPolicy) throw new Error(TEE_COMMISSIONING_PREREQUISITE);
  return config.inferenceTrustPolicy;
}

function assertUnreachableMode(mode: never): never {
  throw new Error(`unsupported inference mode: ${String(mode)}`);
}

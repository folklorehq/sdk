// SPDX-License-Identifier: Apache-2.0
import type { TelemetryClient } from '@folklore/telemetry';
import type { InferenceResponseVerifier } from './ports.js';
import { OpenAICompatBackend } from './OpenAICompatBackend.js';
import { DEFAULT_VERIFIED_MODELS } from './model-allowlist.js';

export interface TeeEndpointConfig {
  /** Base URL of the TEE inference endpoint — must point to a verified Phala CVM or Folklore-hosted TEE endpoint. */
  baseUrl: string;
  /** API key for authenticating with the TEE endpoint. */
  apiKey?: string;
  /** Default embedding model name. Default: 'qwen/qwen3-embedding-8b' (natively 4096-dim). */
  embedModel?: string;
  /** When set, request this dimensionality via the OpenAI `dimensions` param and reject a response of another length. */
  embedDimensions?: number;
  /** Default text-generation model name. Default: 'z-ai/glm-5.2' (TEE-attested reasoning model). */
  generateModel?: string;
  /** Verified-model allowlist. Default: {@link DEFAULT_VERIFIED_MODELS}. Off-list models are rejected before sending. */
  modelAllowlist?: readonly string[];
  /** Proves each response came from a verified TEE upstream via its ACI receipt. */
  responseVerifier?: InferenceResponseVerifier;
  /** Request timeout in milliseconds. Default: 60000 (remote endpoints are slower). */
  timeoutMs?: number;
  telemetry?: TelemetryClient;
}

const DEFAULT_EMBED_MODEL = 'qwen/qwen3-embedding-8b';
const DEFAULT_GENERATE_MODEL = 'z-ai/glm-5.2';

/** Calls a remote TEE-backed inference endpoint (Phala or Folklore-hosted); an {@link OpenAICompatBackend} with TEE-specific defaults. */
export class TeeEndpointBackend extends OpenAICompatBackend {
  constructor(config: TeeEndpointConfig) {
    super({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      embedModel: config.embedModel ?? DEFAULT_EMBED_MODEL,
      embedDimensions: config.embedDimensions,
      generateModel: config.generateModel ?? DEFAULT_GENERATE_MODEL,
      modelAllowlist: config.modelAllowlist ?? DEFAULT_VERIFIED_MODELS,
      responseVerifier: config.responseVerifier,
      timeoutMs: config.timeoutMs,
      label: 'TEE endpoint',
      telemetry: config.telemetry,
    });
  }
}

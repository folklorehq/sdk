// SPDX-License-Identifier: Apache-2.0
import type { TelemetryClient } from '@folklore/telemetry';
import type { InferenceBackend, InferenceResponseVerifier } from './ports.js';
import { TeeEndpointBackend } from './TeeEndpointBackend.js';
import { OpenAICompatBackend } from './OpenAICompatBackend.js';
import { StubInferenceBackend } from './StubInferenceBackend.js';
import { RoutingInferenceBackend, type TaskModelMap } from './model-router.js';
import { AciReceiptVerifier } from './aci-verifier.js';

/** How inference is executed; no external/unattested API option and no local model runtime in prod. */
export type InferenceMode = 'local-openai' | 'phala-endpoint' | 'folklore-tee' | 'stub';

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

  /** Verified-model allowlist for TEE modes (fail-closed). Defaults to the built-in verified set. */
  modelAllowlist?: readonly string[];

  aciExpectedHost?: string;
  aciExpectedWorkloadId?: string;
  aciExpectedKeysetDigest?: string;

  /** Optional task→model routing — tagged `generate`/`stream` calls use the model configured for that task. See {@link tieredTaskModels}. */
  taskModels?: TaskModelMap;
}

export function createInferenceBackend(config: InferenceConfig): InferenceBackend {
  const base = createBaseBackend(config);
  if (config.taskModels && Object.keys(config.taskModels).length > 0) {
    return new RoutingInferenceBackend(base, config.taskModels);
  }
  return base;
}

function createBaseBackend(config: InferenceConfig): InferenceBackend {
  const mode = config.mode;
  if (mode === undefined) {
    throw new Error(
      'inference mode is not configured: set an explicit mode ' +
        '(stub | local-openai | phala-endpoint | folklore-tee).',
    );
  }

  switch (mode) {
    case 'stub':
      return new StubInferenceBackend();

    case 'local-openai': {
      if (!config.openaiBaseUrl) {
        throw new Error(
          `inference mode "local-openai" requires openaiBaseUrl to be set. ` +
            `Set OPENAI_BASE_URL (e.g. http://vllm:8000/v1) in the environment or inference config.`,
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
        embedModel: config.embedModel,
        generateModel: config.generateModel,
        modelAllowlist: config.modelAllowlist,
        responseVerifier: buildReceiptVerifier(config),
        telemetry: config.telemetry,
      });
    }

    default:
      return assertUnreachableMode(mode);
  }
}

function buildReceiptVerifier(config: InferenceConfig): InferenceResponseVerifier {
  if (!config.teeEndpointUrl) throw new Error('TEE receipt verifier requires teeEndpointUrl');
  return new AciReceiptVerifier({
    baseUrl: config.teeEndpointUrl,
    expectedHost: requiredPin(config.aciExpectedHost, 'aciExpectedHost'),
    expectedWorkloadId: requiredPin(config.aciExpectedWorkloadId, 'aciExpectedWorkloadId'),
    expectedKeysetDigest: requiredPin(config.aciExpectedKeysetDigest, 'aciExpectedKeysetDigest'),
    apiKey: config.teeApiKey,
    telemetry: config.telemetry,
  });
}

function requiredPin(value: string | undefined, name: string): string {
  if (!value) throw new Error(`TEE receipt verifier requires ${name}`);
  return value;
}

function assertUnreachableMode(mode: never): never {
  throw new Error(`unsupported inference mode: ${String(mode)}`);
}

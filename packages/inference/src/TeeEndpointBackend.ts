// SPDX-License-Identifier: Apache-2.0
import {
  inferenceTrustPolicyV1Schema,
  type InferenceModelRole,
  type InferenceRoleModelV1,
  type InferenceTrustPolicyV1,
} from '@folklore/contracts';
import type { TelemetryClient } from '@folklore/telemetry';
import type {
  EmbedOptions,
  GenerateOptions,
  InferenceResponseVerifier,
  InferenceUsageSink,
  StructuredOptions,
} from './ports.js';
import { OpenAICompatBackend, type InferenceModelSelection } from './OpenAICompatBackend.js';

export interface TeeEndpointConfig {
  /** Endpoint selected by the signed policy; it must match policy origin and route. */
  baseUrl: string;
  /** API key for authenticating with the TEE endpoint. */
  apiKey?: string;
  /** Signed offline policy that supplies endpoint, models, revisions, roots, and keys. */
  trustPolicy: InferenceTrustPolicyV1;
  /** Proves each response came from the signed ACI provider contract. */
  responseVerifier: InferenceResponseVerifier;
  /** Fetch bound to the same offline-authorized TLS pins used by the response verifier. */
  fetchImpl: typeof fetch;
  /** When set, request this dimensionality via the OpenAI `dimensions` param. */
  embedDimensions?: number;
  /** Receives content-free token counts of every successful call. */
  usageSink?: InferenceUsageSink;
  /** Request timeout in milliseconds. Default: 60000. */
  timeoutMs?: number;
  telemetry?: TelemetryClient;
}

const ROLE_ALLOWLIST = ['embed', 'generate', 'judge', 'critique'] as const;

export class TeeEndpointBackend extends OpenAICompatBackend {
  private readonly trustPolicy: InferenceTrustPolicyV1;

  constructor(config: TeeEndpointConfig) {
    const trustPolicy = inferenceTrustPolicyV1Schema.parse(config.trustPolicy);
    if (!config.responseVerifier) {
      throw new Error(
        'inference commissioning prerequisite unmet: TEE response verifier is required',
      );
    }
    if (!config.fetchImpl) {
      throw new Error('inference commissioning prerequisite unmet: pinned transport is required');
    }
    const normalizedBaseUrl = config.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    const expectedBaseUrl = `${trustPolicy.origin}${trustPolicy.route}`
      .replace(/\/$/, '')
      .replace(/\/v1$/, '');
    if (normalizedBaseUrl !== expectedBaseUrl) {
      throw new Error('inference endpoint does not match the offline trust policy');
    }
    const roleModels = trustPolicy.roleModels;
    super({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      embedModel: roleModels.embed.model,
      embedModelRevision: roleModels.embed.revision,
      embedDimensions: config.embedDimensions,
      generateModel: roleModels.generate.model,
      generateModelRevision: roleModels.generate.revision,
      modelAllowlist: ROLE_ALLOWLIST.map((role) => roleModels[role].model),
      responseVerifier: config.responseVerifier,
      usageSink: config.usageSink,
      timeoutMs: config.timeoutMs,
      label: 'TEE endpoint',
      telemetry: config.telemetry,
      fetchImpl: config.fetchImpl,
    });
    this.trustPolicy = trustPolicy;
  }

  protected override resolveEmbedSelection(options?: EmbedOptions): InferenceModelSelection {
    return this.resolveRoleSelection('embed', options ?? {});
  }

  protected override resolveGenerateSelection(options?: GenerateOptions): InferenceModelSelection {
    return this.resolveRoleSelection(options?.modelRole ?? 'generate', options ?? {});
  }

  protected override resolveStructuredSelection(
    options: StructuredOptions,
  ): InferenceModelSelection {
    return this.resolveRoleSelection('judge', options);
  }

  private resolveRoleSelection(
    role: InferenceModelRole,
    options: EmbedOptions | GenerateOptions,
  ): InferenceModelSelection {
    const expected: InferenceRoleModelV1 = this.trustPolicy.roleModels[role];
    if (options.modelRole !== undefined && options.modelRole !== role) {
      throw new Error(`TEE endpoint refused model role override for ${role}`);
    }
    if (options.model !== undefined && options.model !== expected.model) {
      throw new Error(`TEE endpoint refused model override for ${role}`);
    }
    if (options.modelRevision !== undefined && options.modelRevision !== expected.revision) {
      throw new Error(`TEE endpoint refused model revision override for ${role}`);
    }
    return { model: expected.model, revision: expected.revision, role };
  }
}

import type { TelemetryClient } from '@folklore/telemetry';
import type { InferenceBackend } from './ports.js';
import { type TaskModelMap } from './model-router.js';
/** How inference is executed; no external/unattested API option and no local model runtime in prod. */
export type InferenceMode = 'local-openai' | 'phala-endpoint' | 'folklore-tee' | 'stub';
export interface InferenceConfig {
    /** Inference mode. Required to be explicit — an unset mode throws rather than silently degrading. */
    mode?: InferenceMode;
    embedModel?: string;
    generateModel?: string;
    teeEndpointUrl?: string;
    teeApiKey?: string;
    openaiBaseUrl?: string;
    openaiApiKey?: string;
    telemetry?: TelemetryClient;
    /** Verified-model allowlist for TEE modes (fail-closed). Defaults to the built-in verified set. */
    modelAllowlist?: readonly string[];
    /** Verify each TEE response against its Phala ACI receipt (attestation pin + upstream.verified). */
    verifyReceipts?: boolean;
    /** Also enforce the receipt signature (scoped next step — see AciVerifierConfig). */
    enforceReceiptSignature?: boolean;
    /** Optional task→model routing — tagged `generate`/`stream` calls use the model configured for that task. See {@link tieredTaskModels}. */
    taskModels?: TaskModelMap;
}
export declare function createInferenceBackend(config: InferenceConfig): InferenceBackend;
//# sourceMappingURL=factory.d.ts.map
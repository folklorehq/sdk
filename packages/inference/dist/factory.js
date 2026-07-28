import { TeeEndpointBackend } from './tee-endpoint.js';
import { OpenAICompatBackend } from './openai-compat.js';
import { StubInferenceBackend } from './stub.js';
import { RoutingInferenceBackend } from './model-router.js';
import { AciReceiptVerifier } from './aci-verifier.js';
export function createInferenceBackend(config) {
    const base = createBaseBackend(config);
    if (config.taskModels && Object.keys(config.taskModels).length > 0) {
        return new RoutingInferenceBackend(base, config.taskModels);
    }
    return base;
}
function createBaseBackend(config) {
    const mode = config.mode;
    if (mode === undefined) {
        throw new Error('inference mode is not configured: set an explicit mode ' +
            '(stub | local-openai | phala-endpoint | folklore-tee).');
    }
    switch (mode) {
        case 'stub':
            return new StubInferenceBackend();
        case 'local-openai': {
            if (!config.openaiBaseUrl) {
                throw new Error(`inference mode "local-openai" requires openaiBaseUrl to be set. ` +
                    `Set OPENAI_BASE_URL (e.g. http://vllm:8000/v1) in the environment or inference config.`);
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
                throw new Error(`inference mode "${mode}" requires teeEndpointUrl to be set. ` +
                    `Set TEE_ENDPOINT_URL in the environment or inference config.`);
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
function buildReceiptVerifier(config) {
    if (!config.verifyReceipts || !config.teeEndpointUrl)
        return undefined;
    return new AciReceiptVerifier({
        baseUrl: config.teeEndpointUrl,
        apiKey: config.teeApiKey,
        telemetry: config.telemetry,
        enforceReceiptSignature: config.enforceReceiptSignature,
    });
}
function assertUnreachableMode(mode) {
    throw new Error(`unsupported inference mode: ${String(mode)}`);
}
//# sourceMappingURL=factory.js.map
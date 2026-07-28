import { OpenAICompatBackend } from './OpenAICompatBackend.js';
import { DEFAULT_VERIFIED_MODELS } from './model-allowlist.js';
const DEFAULT_EMBED_MODEL = 'qwen/qwen3-embedding-8b';
const DEFAULT_GENERATE_MODEL = 'z-ai/glm-5.2';
/** Calls a remote TEE-backed inference endpoint (Phala or Folklore-hosted); an {@link OpenAICompatBackend} with TEE-specific defaults. */
export class TeeEndpointBackend extends OpenAICompatBackend {
    constructor(config) {
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
//# sourceMappingURL=TeeEndpointBackend.js.map
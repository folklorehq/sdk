import type { TelemetryClient } from '@folklore/telemetry';
import type { InferenceResponseVerifier } from './ports.js';
export declare const ACI_RECEIPT_ID_HEADER = "x-receipt-id";
export type ReceiptVerificationPolicy = 'per-call' | 'first-call';
export interface AciVerifierConfig {
    baseUrl: string;
    apiKey?: string;
    telemetry?: TelemetryClient;
    timeoutMs?: number;
    /** 'per-call' verifies every response; 'first-call' (default) verifies once, bounding latency. */
    policy?: ReceiptVerificationPolicy;
    enforceReceiptSignature?: boolean;
    fetchImpl?: typeof fetch;
}
export declare class InferenceAttestationError extends Error {
    constructor(reason: string);
}
export declare class AciReceiptVerifier implements InferenceResponseVerifier {
    private readonly baseUrl;
    private readonly apiKey;
    private readonly telemetry;
    private readonly timeoutMs;
    private readonly policy;
    private readonly enforceReceiptSignature;
    private readonly fetchImpl;
    private pinned;
    private pinning;
    private satisfied;
    constructor(config: AciVerifierConfig);
    ensureAttested(): Promise<void>;
    verifyReceipt(receiptId: string | null): Promise<void>;
    private pin;
    private fetchAttestation;
    private fetchReceipt;
    private assertWorkloadMatches;
    private assertUpstreamVerified;
    private assertSignature;
    private verifyWithKey;
    private canonicalSignedPayload;
    private decodeBytes;
    private getJson;
    private parse;
    private fail;
    private headers;
}
//# sourceMappingURL=aci-verifier.d.ts.map
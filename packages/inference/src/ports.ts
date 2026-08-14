// SPDX-License-Identifier: Apache-2.0
import type { AciSession, InferenceModelRole, InferenceTrustPolicyV2 } from '@folklore/contracts';

/** InferenceBackend port — all inference MUST happen inside the customer's box; sending fact content to an external API is structurally prohibited. */

export interface EmbedOptions {
  /** Override the default embedding model for this call. */
  model?: string;
  /** Exact provider revision expected for this call. */
  modelRevision?: string;
  /** Signed-policy role expected for this call. */
  modelRole?: InferenceModelRole;
}

export interface GenerateOptions {
  /** Override the default generation model for this call. */
  model?: string;
  /** Exact provider revision expected for this call. */
  modelRevision?: string;
  /** Signed-policy role expected for this call. */
  modelRole?: InferenceModelRole;
  /** System prompt to prepend before the user prompt. */
  systemPrompt?: string;
  /** Maximum number of tokens to generate. */
  maxTokens?: number;
  /** Sampling temperature (0 = deterministic, higher = more creative). */
  temperature?: number;
  /** Coarse task class for tiered model routing (picks a small/large model); ignored by non-routing backends. */
  task?: InferenceTask;
}

/** Coarse task classes for tiered routing — the first group is cheap/structured, the last two need a frontier model. */
export type InferenceTask =
  | 'labeling'
  | 'noise-filter'
  | 'classification'
  | 'extraction'
  | 'synthesis'
  | 'query';

/** One forced function the model must call, returning a single JSON object argument. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the tool's single object argument (the structured output shape). */
  parameters: Record<string, unknown>;
}

export interface StructuredOptions extends GenerateOptions {
  tool: ToolSpec;
}

/** The three billable call classes; `stream` is deliberately absent — OpenAI streaming reports no usage without `stream_options`. */
export type InferenceOperation = 'embed' | 'generate' | 'structured';

/** Content-free per-call cost signal: a config-sourced model id, the call class, and integer counts — never prompt or output text. */
export interface InferenceUsageEvent {
  model: string;
  operation: InferenceOperation;
  promptTokens: number;
  completionTokens: number;
  /** True when a cache layer served the call, so it cost the upstream nothing. */
  cached: boolean;
}

export type InferenceUsageSink = (event: InferenceUsageEvent) => void;

export interface AttestationReport {
  /** Hex-encoded TDX attestation quote issued by the Phala dstack daemon. */
  quote: string;
  /** ISO 8601 timestamp of when the quote was obtained. */
  timestamp: string;
}

/** Proves an inference response came from a TEE-verified (confidential) upstream. */
export interface InferenceResponseVerifier {
  /** Pin + verify the gateway's ACI attestation once; throws (fail-closed) if unverifiable. */
  ensureAttested(): Promise<void>;
  /** Verify the per-response receipt against the exact serialized exchange. */
  verifyReceipt(receiptId: string | null, evidence: InferenceExchangeEvidence): Promise<void>;
}

export interface InferenceExchangeEvidence {
  requestSha256: string;
  responseSha256: string;
  model: string;
  modelRevision: string;
  modelRole?: InferenceModelRole;
  nonce: string;
}

export type { InferenceModelRole };

export type AciEvidencePolicyAnchors = Pick<
  InferenceTrustPolicyV2,
  | 'origin'
  | 'route'
  | 'channelPolicy'
  | 'evidence'
  | 'sourceProvenance'
  | 'requiredSessionClaims'
  | 'permittedClaimSources'
>;

export interface AciEvidenceVerificationInput {
  readonly reportBytes: Uint8Array;
  readonly evidenceBytes: Uint8Array;
  readonly nonce: Uint8Array;
  readonly policyAnchors: AciEvidencePolicyAnchors;
  readonly signal: AbortSignal;
  readonly deadline: number;
}

export interface VerifiedAciEvidenceBindings {
  readonly workloadId: string;
  readonly nonce: string;
  readonly reportDataStatementDigest: string;
  readonly workloadKeysetDigest: string;
  readonly channelKeyDigest: string;
  readonly teeType: 'tdx' | 'sev_snp';
  readonly runtimeIdentity: string;
  readonly appIdentity: string;
  readonly composeDigest: string | null;
  readonly imageDigest: string | null;
  readonly kmsRootDigest: string;
  readonly quoteRootDigest: string;
  readonly measurements: readonly string[];
  readonly rtmrs: readonly string[];
  readonly tcbStatus: string;
  readonly sourceRevision: string;
  readonly evidenceTranscriptDigest: string;
}

export interface AciEvidenceVerifierPort {
  /** The enclave native adapter must isolate synchronous verification in a killable process or worker and terminate it on signal/deadline; TypeScript cannot preempt synchronous native execution. */
  verify(input: AciEvidenceVerificationInput): Promise<VerifiedAciEvidenceBindings>;
}

export interface AciSessionEvidenceVerificationInput {
  readonly sessionBytes: Uint8Array;
  readonly evidenceBytes: Uint8Array;
  readonly policyAnchors: AciEvidencePolicyAnchors;
  readonly signal: AbortSignal;
  readonly deadline: number;
}

export interface VerifiedAciSessionEvidenceBindings {
  readonly sessionId: string;
  readonly claims: AciSession['claims'];
  readonly identity: AciSession['identity'] | null;
  readonly channelBindings: AciSession['channel_binding'];
  readonly establishedAt: number;
  readonly expiresAt: number;
  readonly upstreamIdentityDigest: string;
  readonly channelKeyDigest: string;
}

export interface AciSessionEvidenceVerifierPort {
  /** Verifies official session evidence without receiving customer content, credentials, or prompts. */
  verify(input: AciSessionEvidenceVerificationInput): Promise<VerifiedAciSessionEvidenceBindings>;
}

export interface VerifiedAciChannelPin {
  readonly type: 'tls_spki_sha256' | 'tls_certificate_sha256' | 'e2ee_public_key_sha256';
  readonly value: string;
  readonly domain?: string;
  readonly algorithm?: string;
  readonly keyId?: string;
  readonly provider?: string;
}

export interface VerifiedAciKeyset {
  readonly workloadId: string;
  readonly workloadKeysetDigest: string;
  readonly version: number;
  readonly notAfter: number;
  readonly receiptSigningKeys: readonly {
    readonly keyId: string;
    readonly algorithm: string;
    readonly publicKey: string;
  }[];
  readonly e2eePublicKeys: readonly {
    readonly keyId: string;
    readonly algorithm: string;
    readonly publicKey: string;
  }[];
  readonly tlsPublicKeys: readonly {
    readonly spkiSha256: string;
    readonly domain?: string;
  }[];
  readonly channelPins: readonly VerifiedAciChannelPin[];
  readonly channelKeyDigest: string;
}

export interface AciSessionCandidate {
  readonly role: InferenceModelRole;
  readonly model: string;
  readonly modelRevision: string;
  readonly workloadKeysetDigest: string;
  readonly channelKeyDigest: string;
  readonly policyGeneration: number;
  readonly activationGeneration: number;
  readonly session: AciSession;
  readonly sessionBytes: Uint8Array;
}

export interface AciSessionVerificationHighWater {
  readonly minimumPolicyGeneration: number;
  readonly minimumActivationGeneration: number;
  readonly minimumKeysetVersion: number;
  readonly supersededKeysetDigests: readonly string[];
}

export interface AciSessionVerificationInput {
  readonly keyset: VerifiedAciKeyset;
  readonly candidates: readonly AciSessionCandidate[];
  readonly highWater: AciSessionVerificationHighWater;
}

export interface VerifiedAciSession {
  readonly role: InferenceModelRole;
  readonly model: string;
  readonly modelRevision: string;
  readonly sessionId: string;
  readonly establishedAt: number;
  readonly expiresAt: number;
  readonly workloadKeysetDigest: string;
  readonly channelKeyDigest: string;
  readonly channelPins: readonly VerifiedAciChannelPin[];
  readonly upstreamIdentityDigest: string;
}

export type VerifiedAciSessionSet = Readonly<Record<InferenceModelRole, VerifiedAciSession>>;

export interface VerifiedAciTrustSnapshot {
  readonly generation: number;
  readonly policyGeneration: number;
  readonly activationGeneration: number;
  readonly expiresAt: number;
  readonly keyset: VerifiedAciKeyset;
  readonly channelPins: readonly VerifiedAciChannelPin[];
  readonly sessions: VerifiedAciSessionSet;
  readonly supersededKeysetDigests: readonly string[];
}

export interface AciReceiptVerificationInput {
  readonly snapshot: VerifiedAciTrustSnapshot;
  readonly receiptId: string | null;
  readonly requestBytes: Uint8Array;
  readonly responseBytes: Uint8Array;
  readonly role: InferenceModelRole;
  readonly endpoint: string;
  readonly method: string;
}

export interface VerifiedAciReceipt {
  readonly receiptId: string;
  readonly servedAt: number;
  readonly sessionId: string;
}

export interface AciReceiptVerifierConfig {
  readonly baseUrl: string;
  readonly policy: InferenceTrustPolicyV2;
  readonly fetchImpl: typeof fetch;
  readonly apiKey?: string;
  readonly clock?: () => number;
  readonly fetchTimeoutMs?: number;
  readonly maxReceiptBytes?: number;
  readonly replayCapacity?: number;
}

export interface AciReceiptVerifierPort {
  verify(input: AciReceiptVerificationInput): Promise<VerifiedAciReceipt>;
}

export interface AciTrustStatePort {
  acquire(): VerifiedAciTrustSnapshot | undefined;
}

export interface OfficialAciRequest {
  readonly role: InferenceModelRole;
  readonly endpoint: string;
  readonly method: 'POST';
  readonly body: unknown;
}

export interface OfficialAciExchangeConfig {
  readonly baseUrl: string;
  readonly policy: InferenceTrustPolicyV2;
  readonly trustState: AciTrustStatePort;
  readonly receiptVerifier: AciReceiptVerifierPort;
  readonly fetchImpl: typeof fetch;
  readonly apiKey?: string;
  readonly clock?: () => number;
  readonly timeoutMs?: number;
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
}

export interface AciReportVerifierConfig {
  baseUrl: string;
  policy: InferenceTrustPolicyV2;
  evidenceVerifier: AciEvidenceVerifierPort;
  fetchImpl: typeof fetch;
  nonceSource?: () => Uint8Array | Promise<Uint8Array>;
  clock?: () => number;
  fetchTimeoutMs?: number;
  nativeVerifierTimeoutMs?: number;
  maxReportBytes?: number;
  apiKey?: string;
}

export interface AciSessionVerifierConfig {
  readonly policy: InferenceTrustPolicyV2;
  readonly evidenceVerifier: AciSessionEvidenceVerifierPort;
  readonly clock?: () => number;
  readonly evidenceVerifierTimeoutMs?: number;
}

export interface InferenceBackend {
  /** Generate a fixed-size embedding vector for the given text. */
  embed(text: string, options?: EmbedOptions): Promise<number[]>;

  /** Generate a completion for the given prompt and return the full response string. */
  generate(prompt: string, options?: GenerateOptions): Promise<string>;

  /** Force a tool call and return its parsed JSON argument; optional (a backend may omit it). */
  generateStructured?(prompt: string, options: StructuredOptions): Promise<unknown>;

  /** Stream a completion token by token. */
  stream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;

  /** Return a TEE attestation report for the current CVM, or null if not running inside a TEE. */
  getAttestationReport?(): Promise<AttestationReport | null>;

  /** Release any resources held by the backend (connections, timers, etc.). */
  close(): Promise<void>;
}

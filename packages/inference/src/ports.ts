// SPDX-License-Identifier: Apache-2.0
import type {
  AciSession,
  InferenceModelRole,
  InferenceTrustPolicyV2,
  PreForwardRouteProofV1,
} from '@folklore/contracts';

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
  readonly trustContext?: AciTrustContext;
  readonly generation: number;
  readonly policyGeneration: number;
  readonly activationGeneration: number;
  readonly expiresAt: number;
  readonly keyset: VerifiedAciKeyset;
  readonly channelPins: readonly VerifiedAciChannelPin[];
  readonly sessions: VerifiedAciSessionSet;
  readonly supersededKeysetDigests: readonly string[];
}

export interface AciTrustContext {
  readonly orgId: string;
  readonly deploymentId: string;
  readonly bootEpoch: string;
  readonly checkpointDigest: string;
}

export interface AciReceiptVerificationInput {
  readonly snapshot: VerifiedAciTrustSnapshot;
  readonly receiptId: string | null;
  readonly requestBytes: Uint8Array;
  readonly responseBytes: Uint8Array;
  readonly role: InferenceModelRole;
  readonly endpoint: string;
  readonly method: string;
  readonly trustedTimeContext: AciTrustContext;
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
  readonly fetchTimeoutMs?: number;
  readonly maxReceiptBytes?: number;
  readonly replayCapacity?: number;
  readonly trustedTimeAuthority: TrustedTimeAuthorityPort;
}

export interface AciReceiptVerifierPort {
  verify(input: AciReceiptVerificationInput): Promise<VerifiedAciReceipt>;
}

export interface AciTrustStatePort {
  acquire(): VerifiedAciTrustSnapshot | undefined;
}

export interface AciV2TrustStatePort {
  acquireWithTrustedTime(context: AciTrustContext): Promise<VerifiedAciTrustSnapshot | undefined>;
  refreshWithTrustedTime(
    expectedGeneration: number,
    candidate: VerifiedAciTrustSnapshot,
    context: AciTrustContext,
  ): Promise<boolean>;
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
  readonly trustState: AciV2TrustStatePort;
  readonly receiptVerifier: AciReceiptVerifierPort;
  readonly fetchImpl: typeof fetch;
  readonly apiKey?: string;
  readonly timeoutMs?: number;
  readonly maxRequestBytes?: number;
  readonly maxResponseBytes?: number;
  readonly trustedTimeAuthority: TrustedTimeAuthorityPort;
  readonly trustedTimeContext: AciTrustContext;
  readonly leaseStore?: ForwardLeaseStorePort;
}

export interface AciReportVerifierConfig {
  baseUrl: string;
  policy: InferenceTrustPolicyV2;
  evidenceVerifier: AciEvidenceVerifierPort;
  fetchImpl: typeof fetch;
  nonceSource?: () => Uint8Array | Promise<Uint8Array>;
  fetchTimeoutMs?: number;
  nativeVerifierTimeoutMs?: number;
  maxReportBytes?: number;
  apiKey?: string;
  trustedTimeAuthority: TrustedTimeAuthorityPort;
  trustedTimeContext: AciTrustContext;
}

export interface AciSessionVerifierConfig {
  readonly policy: InferenceTrustPolicyV2;
  readonly evidenceVerifier: AciSessionEvidenceVerifierPort;
  readonly evidenceVerifierTimeoutMs?: number;
  readonly trustedTimeAuthority: TrustedTimeAuthorityPort;
  readonly trustedTimeContext: AciTrustContext;
}

export interface PreForwardRouteBinding {
  orgId: string;
  deploymentId: string;
  tenantId: string;
  assignmentDigest: string;
  proofId: string;
  workloadId: string;
  runtimeIdentityDigest: string;
  workloadArtifactDigest: string;
  pinnedTrustRootDigest: string;
  channelKeyDigest: string;
  exporterLabel: string;
  exporterDigest: string;
  transcriptDigest: string;
  snapshotDigest: string;
  policyDigest: string;
  tenantAadDigest: string;
  origin: string;
  route: string;
  method: 'POST';
  routeIdentityDigest: string;
  role: InferenceModelRole;
  sessionId: string;
  model: string;
  modelRevision: string;
  modelArtifactDigest: string;
  workloadKeysetDigest: string;
  capabilityDigest: string;
  policyGeneration: number;
  activationGeneration: number;
  gatewayNonce: string;
  requestId: string;
  bootEpoch: string;
  trustedTimeCheckpointDigest: string;
}

export interface TrustedTimeReadContext {
  readonly orgId?: string;
  readonly deploymentId?: string;
  readonly bootEpoch?: string;
  readonly checkpointDigest?: string;
}

export interface TrustedTimeSample {
  trustedNow: number;
  checkpointDigest: string;
  bootEpoch: string;
  orgId: string;
  deploymentId: string;
}

export interface TrustedTimeAuthorityPort {
  read(context?: TrustedTimeReadContext): Promise<TrustedTimeSample>;
}

export interface PreForwardRouteProofVerificationInput {
  encodedProof: Uint8Array;
  expected: PreForwardRouteBinding;
}

export interface PreForwardRouteProofVerifierPort {
  verify(input: PreForwardRouteProofVerificationInput): Promise<PreForwardRouteProofV1>;
}

export interface PrivateOfficialAciRequestWire {
  readonly bytes: Uint8Array;
  readonly requestWireSha256: string;
  readonly byteLength: number;
}

export interface MutuallyAttestedChannel {
  readonly channelKeyDigest: string;
  readonly exporterLabel: string;
  readonly exporterDigest: string;
  readonly transcriptDigest: string;
  sendControl(message: Uint8Array): Promise<void>;
  receiveControlProof(): Promise<Uint8Array>;
  writeBody(requestWireBytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

export interface MutuallyAttestedChannelPort {
  open(input: {
    orgId: string;
    deploymentId: string;
    workloadId: string;
    routeIdentityDigest: string;
    pinnedTrustRootDigest: string;
    channelKeyDigest: string;
  }): Promise<MutuallyAttestedChannel>;
}

export interface ControlProofExchangePort {
  exchange(input: {
    channel: MutuallyAttestedChannel;
    challenge: { gatewayNonce: string; requestId: string; bootEpoch: string };
    descriptor: {
      role: InferenceModelRole;
      method: 'POST';
      route: string;
      tenantId: string;
      assignmentDigest: string;
      tenantAadDigest: string;
      capabilityDigest: string;
      contentLength: number;
      sessionId: string;
      model: string;
      modelRevision: string;
      modelArtifactDigest: string;
      policyGeneration: number;
      activationGeneration: number;
    };
  }): Promise<Uint8Array>;
}

export interface OfficialAciRequestWireSerializerPort {
  serialize(request: OfficialAciRequest): Promise<PrivateOfficialAciRequestWire>;
}

export interface ForwardProofReservation {
  orgId: string;
  deploymentId: string;
  tenantId: string;
  assignmentDigest: string;
  workloadId: string;
  runtimeIdentityDigest: string;
  workloadArtifactDigest: string;
  pinnedTrustRootDigest: string;
  workloadKeysetDigest: string;
  tenantAadDigest: string;
  bootEpoch: string;
  trustedTimeCheckpointDigest: string;
  gatewayNonce: string;
  proofId: string;
  requestId: string;
  snapshotDigest: string;
  policyDigest: string;
  role: InferenceModelRole;
  sessionId: string;
  model: string;
  modelRevision: string;
  modelArtifactDigest: string;
  capabilityDigest: string;
  origin: string;
  route: string;
  method: 'POST';
  routeIdentityDigest: string;
  channelKeyDigest: string;
  exporterLabel: string;
  exporterDigest: string;
  transcriptDigest: string;
  policyGeneration: number;
  activationGeneration: number;
  requestWireSha256: string;
  requestWireByteLength: number;
  privateRequestWire: PrivateOfficialAciRequestWire;
  proofIssuedAt: number;
  proofExpiresAt: number;
  snapshotExpiresAt: number;
  admissionExpiresAt: number;
  boundedWriteValidUntil: number;
}

export interface ForwardLease extends ForwardProofReservation {
  leaseId: string;
}

export interface ForwardLeaseStorePort {
  reserve(input: ForwardProofReservation): Promise<ForwardLease>;
  consume(input: {
    lease: ForwardLease;
    candidateRequestWire: PrivateOfficialAciRequestWire;
  }): Promise<void>;
}

export interface PreForwardAdmissionPort {
  authorize(input: {
    orgId: string;
    deploymentId: string;
    tenantId: string;
    assignmentDigest: string;
    tenantAadDigest: string;
    operation: InferenceModelRole;
    contentLength: number;
  }): Promise<ForwardLease>;
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

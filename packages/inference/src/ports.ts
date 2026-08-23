// SPDX-License-Identifier: Apache-2.0
import type {
  AciSession,
  Digest64,
  DurableGenerationHighWaterCheckpointV1,
  GenerationContextV1,
  InferenceModelRole,
  InferenceTrustPolicyV2,
  ModelExecutionModeV1,
  ModelProvenanceSourceV1,
  PolicySignedModelProvenanceTupleV1,
  PreForwardRouteProofV1,
  ProductionVerifiedModelProvenanceV1,
  ProviderNativeModelArtifactBindingV1,
  SyntheticVerifiedModelProvenanceV1,
  TrustedTimeBindingV1,
  TrustedTimeSampleV1,
  UnknownModelProvenanceV1,
  VerifiedModelProvenanceV1,
} from '@folklore/contracts';

export type { TrustedTimeBindingV1, TrustedTimeSampleV1 } from '@folklore/contracts';

export interface DurableGenerationHighWaterClientPort {
  read(context: GenerationContextV1): Promise<DurableGenerationHighWaterCheckpointV1>;
}

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
  readonly type: 'tls_spki_sha256' | 'e2ee_public_key_sha256';
  readonly value: string;
  readonly domain?: string;
  readonly algorithm?: string;
  readonly keyId?: string;
  readonly provider?: string;
}

export interface VerifiedAciUpstreamIdentity {
  readonly upstreamName: string;
  readonly urlOrigin: string | null;
  readonly verifierId: string;
  readonly claims: AciSession['claims'];
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
  readonly sessionId: string;
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
  readonly upstreamIdentity: VerifiedAciUpstreamIdentity;
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

export interface AciReceiptReplayClaim {
  readonly orgId: string;
  readonly deploymentId: string;
  readonly receiptId: string;
  readonly workloadKeysetDigest: string;
  readonly sessionId: string;
}

export interface AciReceiptReplayPort {
  claim(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly receiptId: string;
    readonly workloadKeysetDigest: string;
    readonly sessionId: string;
  }): Promise<AciReceiptReplayClaim>;
  markVerified(claim: AciReceiptReplayClaim): Promise<void>;
  releasePending(claim: AciReceiptReplayClaim): Promise<void>;
}

export type AciReceiptReplayStorePort = AciReceiptReplayPort;

export interface AciTrustHighWater {
  readonly generation: number;
  readonly policyGeneration: number;
  readonly activationGeneration: number;
  readonly keysetVersion: number;
  readonly currentKeysetDigest: string;
  readonly supersededKeysetDigests: readonly string[];
  readonly trustContext: AciTrustContext;
}

export interface AciTrustHighWaterStorePort extends AciKeysetHighWaterPort {
  load(context: AciTrustContext): Promise<AciTrustHighWater | undefined>;
  isKeysetSuperseded(input: {
    readonly context: AciTrustContext;
    readonly keysetDigest: string;
  }): Promise<boolean>;
  compareAndSet(
    context: AciTrustContext,
    expectedGeneration: number,
    next: AciTrustHighWater,
  ): Promise<boolean>;
}

export interface AciKeysetHighWater {
  readonly epoch: number;
  readonly digest: string;
  readonly checkpointDigest: string;
  readonly orgId: string;
  readonly deploymentId: string;
}

export interface AciKeysetHighWaterPort {
  read(context: AciTrustContext): Promise<AciKeysetHighWater>;
  advance(input: {
    readonly context: AciTrustContext;
    readonly epoch: number;
    readonly digest: string;
  }): Promise<AciKeysetHighWater>;
}

export interface AciKeysetHighWaterAuthorityPort {
  read(context: AciTrustContext): Promise<AciTrustHighWater | undefined>;
  admitKeyset(input: {
    readonly context: AciTrustContext;
    readonly keysetDigest: string;
    readonly policyGeneration: number;
    readonly activationGeneration: number;
  }): Promise<number>;
}

export interface ForwardAdmissionCapability {
  readonly __aciForwardAdmissionCapability: unique symbol;
}

export interface ForwardBodyOpenCapability {
  readonly __aciForwardBodyOpenCapability: unique symbol;
}

export interface VerifiedAciReceipt {
  readonly receiptId: string;
  readonly servedAt: number;
  readonly outcome?: 'served' | 'refused';
  readonly sessionId?: string;
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
  readonly replayStore: AciReceiptReplayStorePort;
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
  readonly transport?: OfficialAciTransportPort;
  readonly fetchImpl?: typeof fetch;
  readonly channelTransport?: AciChannelTransportPort;
  readonly testOnlyAllowUnleasedPaths?: boolean;
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
  activationGeneration: number;
  evidenceVerifier: AciEvidenceVerifierPort;
  fetchImpl: typeof fetch;
  nonceSource?: () => Uint8Array | Promise<Uint8Array>;
  fetchTimeoutMs?: number;
  nativeVerifierTimeoutMs?: number;
  maxReportBytes?: number;
  apiKey?: string;
  trustedTimeAuthority: TrustedTimeAuthorityPort;
  trustedTimeContext: AciTrustContext;
  keysetHighWaterAuthority?: AciKeysetHighWaterAuthorityPort;
}

export interface AciSessionVerifierConfig {
  readonly policy: InferenceTrustPolicyV2;
  readonly evidenceVerifier: AciSessionEvidenceVerifierPort;
  readonly evidenceVerifierTimeoutMs?: number;
  readonly trustedTimeAuthority: TrustedTimeAuthorityPort;
  readonly trustedTimeContext: AciTrustContext;
  readonly keysetHighWaterAuthority?: AciKeysetHighWaterAuthorityPort;
}

export interface PreForwardRouteExpectation {
  readonly orgId: string;
  readonly deploymentId: string;
  readonly tenantId: string;
  readonly assignmentDigest: string;
  readonly proofId: string;
  readonly workloadId: string;
  readonly runtimeIdentityDigest: string;
  readonly workloadArtifactDigest: string;
  readonly pinnedTrustRootDigest: string;
  readonly channelKeyDigest: string;
  readonly exporterLabel: string;
  readonly exporterDigest: string;
  readonly transcriptDigest: string;
  readonly snapshotDigest: string;
  readonly policyDigest: string;
  readonly tenantAadDigest: string;
  readonly origin: string;
  readonly route: string;
  readonly method: 'POST';
  readonly routeIdentityDigest: string;
  readonly role: InferenceModelRole;
  readonly sessionId: string;
  readonly model: string;
  readonly modelRevision: string;
  readonly modelArtifactDigest: string;
  readonly workloadKeysetDigest: string;
  readonly capabilityDigest: string;
  readonly policyGeneration: number;
  readonly activationGeneration: number;
  readonly gatewayNonce: string;
  readonly requestId: string;
  readonly bootEpoch: string;
  readonly trustedTimeCheckpointDigest: string;
}

// The post-proof result (plan Task 3): every pre-forward expectation field plus the opaque
// proof identity, the full controlled binding digest, and the controlled-gateway source tag.
// The runtime brand lives in ControlledGatewayModelArtifactBindingVerifier; only that module
// mints it, and ModelProvenanceGate accepts controlled bindings only through its guard.
export interface PreForwardRouteBinding extends PreForwardRouteExpectation {
  readonly proofDigest: Digest64;
  readonly bindingDigest: Digest64;
  readonly source: 'controlled-gateway';
}

export type VerifiedPreForwardRouteProof = Readonly<PreForwardRouteProofV1>;

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

export type TrustedTimeDecisionReason =
  | 'proof'
  | 'lease'
  | 'first-byte'
  | 'receipt'
  | 'expiry'
  | 'rollback'
  | 'release';

export interface NsmAttestationDocumentV1 {
  readonly timestampMs: number;
  readonly nonce: Uint8Array;
  readonly userData: Uint8Array;
  readonly pcr0: string;
  readonly documentDigest: string;
  readonly publicKey: Uint8Array | null;
  readonly chainVerified: boolean;
  readonly rootVerified: boolean;
  readonly signatureVerified: boolean;
}

export interface NsmTrustedTimeSourcePort {
  attest(input: { nonce: Uint8Array; userData: Uint8Array }): Promise<NsmAttestationDocumentV1>;
}

export interface MonotonicRawClockPort {
  readNanoseconds(): bigint;
}

export interface TrustedWriteBoundaryPort {
  readonly isTrustedTimeBound: true;
  assertValid(input: {
    readonly context: AciTrustContext;
    readonly validUntil: number;
    readonly trustedNow: number;
  }): void;
}

export interface TrustedTimeAuthorityPort {
  read(context?: TrustedTimeReadContext): Promise<TrustedTimeSample>;
}

export interface TrustedTimeAuthorityV1Port extends TrustedTimeAuthorityPort {
  initialize(binding: TrustedTimeBindingV1): Promise<void>;
  sample(reason: TrustedTimeDecisionReason): Promise<TrustedTimeSampleV1>;
  isHealthy(): boolean;
}

export interface PreForwardRouteProofVerificationInput {
  encodedProof: Uint8Array;
  expected: PreForwardRouteExpectation;
}

export interface PreForwardRouteProofVerifierPort {
  verify(input: PreForwardRouteProofVerificationInput): Promise<VerifiedPreForwardRouteProof>;
  release(proof: VerifiedPreForwardRouteProof): Promise<void>;
  cleanup(input: { readonly context: AciTrustContext; readonly trustedNow: number }): Promise<void>;
}

// The native evidence verifier receives the expected session and keyset identity and returns
// all of it in its result (plan Task 3). The provider-native binding verifier derives the
// expected route identity only from the branded role binding and consumes the returned digest
// byte-for-byte; it never hashes raw evidence or reconstructs an aggregate digest.
export interface ProviderNativeModelArtifactEvidenceV1 {
  readonly orgId: string;
  readonly deploymentId: string;
  readonly role: InferenceModelRole;
  readonly sessionId: string;
  readonly workloadKeysetDigest: Digest64;
  readonly routeIdentityDigest: Digest64;
  readonly issuerWorkloadId: string;
  readonly workloadArtifactDigest: Digest64;
  readonly nativeEvidenceDigest: Digest64;
}

export interface ProviderNativeArtifactEvidenceVerifierPort {
  verify(input: {
    encodedEvidence: Uint8Array;
    expected: {
      orgId: string;
      deploymentId: string;
      role: InferenceModelRole;
      sessionId: string;
      workloadKeysetDigest: Digest64;
      routeIdentityDigest: Digest64;
    };
  }): Promise<ProviderNativeModelArtifactEvidenceV1>;
}

export interface PrivateOfficialAciRequestWire {
  readonly bytes: Uint8Array;
  readonly requestWireSha256: string;
  readonly byteLength: number;
}

export interface ObservedAciChannelBinding {
  readonly observedChannelPin: VerifiedAciChannelPin;
  readonly channelKeyDigest: string;
  readonly exporterLabel: string;
  readonly exporterDigest: string;
  readonly transcriptDigest: string;
}

export const FORWARD_COMMITMENT_PROTOCOL = 'folklore.aci.forward-commitment.v1' as const;

export interface ForwardCommitment {
  readonly protocol: typeof FORWARD_COMMITMENT_PROTOCOL;
  readonly reservationId: string;
  readonly proofId: string;
  readonly requestId: string;
  readonly commitmentNonce: string;
  readonly commitmentTag: string;
  readonly channelKeyDigest: string;
  readonly exporterLabel: string;
  readonly exporterDigest: string;
  readonly transcriptDigest: string;
  readonly observedChannelPin: VerifiedAciChannelPin;
}

export interface VerifiedCommitmentConfirmation extends ForwardCommitment {
  readonly confirmationSequence: number;
}

export interface ForwardWritePermit {
  readonly __aciForwardWritePermit: unique symbol;
  readonly leaseId: string;
  readonly validUntil: number;
  readonly channelKeyDigest: string;
  readonly exporterLabel: string;
  readonly exporterDigest: string;
  readonly transcriptDigest: string;
  readonly observedChannelPin: VerifiedAciChannelPin;
  assertWriteStart(): void;
}

export interface AciChannelWriteOperation {
  readonly response: Promise<AciChannelTransportResponse>;
}

export interface MutuallyAttestedChannel {
  readonly channelKeyDigest: string;
  readonly exporterLabel: string;
  readonly exporterDigest: string;
  readonly transcriptDigest: string;
  readonly observedChannelPin: VerifiedAciChannelPin;
  sendControl(message: Uint8Array): Promise<void>;
  receiveControlProof(): Promise<Uint8Array>;
  /** Enqueue the first body byte synchronously after asserting the permit at the socket boundary. */
  writeBodyOnce(input: {
    readonly bytes: Uint8Array;
    readonly permit: ForwardWritePermit;
    readonly signal?: AbortSignal;
  }): AciChannelWriteOperation;
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
    sessionId: string;
    channelPins: readonly VerifiedAciChannelPin[];
    exporterLabel: string;
    exporterDigest: string;
    transcriptDigest: string;
  }): Promise<MutuallyAttestedChannel>;
}

export interface AciChannelTransportResponse {
  readonly receiptId: string;
  readonly responseBytes: Uint8Array;
  readonly responseOk: boolean;
}

export interface AciChannelTransport {
  readonly channelKeyDigest: string;
  readonly observedChannelPin: VerifiedAciChannelPin;
  send(requestWireBytes: Uint8Array): Promise<AciChannelTransportResponse>;
  close(): Promise<void>;
}

export interface AciChannelTransportPort {
  open(input: {
    readonly endpoint: string;
    readonly context: AciTrustContext;
    readonly session: VerifiedAciSession;
    readonly keyset: VerifiedAciKeyset;
  }): Promise<AciChannelTransport>;
}

export interface OfficialAciTransportPort {
  send(input: {
    readonly capability: ForwardAdmissionCapability;
    readonly signal?: AbortSignal;
  }): Promise<AciChannelTransportResponse>;
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
      sessionId: string;
      model: string;
      modelRevision: string;
      modelArtifactDigest: string;
      policyGeneration: number;
      activationGeneration: number;
    };
  }): Promise<Uint8Array>;
  confirmCommitment(input: {
    readonly channel: MutuallyAttestedChannel;
    readonly commitment: ForwardCommitment;
  }): Promise<VerifiedCommitmentConfirmation>;
}

export interface OfficialAciRequestWireSerializerPort {
  serialize(request: OfficialAciRequest): Promise<PrivateOfficialAciRequestWire>;
}

export interface ForwardCommitmentAuthenticatorPort {
  create(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly wireSha256: string;
    readonly byteLength: number;
  }): string;
  journalTag(entry: Omit<ForwardReplayJournalEntry, 'entryTag'>): string;
}

// The four provenance identity fields committed to a forward reservation at admission (plan
// Task 4). Derived from the verified production decision by the admission caller; the lease
// store never recomputes them and never derives proofDigest from bindingDigest.
export type ForwardReservationProvenanceIdentity = Pick<
  ProductionVerifiedModelProvenanceV1,
  'tupleDigest' | 'proofDigest' | 'bindingDigest' | 'source'
>;

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
  proofIssuedAt: number;
  proofExpiresAt: number;
  snapshotExpiresAt: number;
  admissionExpiresAt: number;
  boundedWriteValidUntil: number;
  commitmentNonce: string;
  observedChannelPin: VerifiedAciChannelPin;
  tupleDigest: Digest64;
  proofDigest: Digest64;
  bindingDigest: Digest64;
  source: ModelProvenanceSourceV1;
}

export interface ForwardAdmissionReservation extends ForwardProofReservation {
  readonly reservationId: string;
}

export interface ForwardLease extends ForwardProofReservation {
  reservationId: string;
  leaseId: string;
  requestWireSha256: string;
  requestWireByteLength: number;
  privateRequestWire: PrivateOfficialAciRequestWire;
}

export interface ForwardLeaseStorePort {
  reserveFromVerifiedProof(input: {
    readonly context: AciTrustContext;
    readonly snapshot: VerifiedAciTrustSnapshot;
    readonly session: VerifiedAciSession;
    readonly observedChannel: ObservedAciChannelBinding;
    readonly proof: VerifiedPreForwardRouteProof;
    readonly provenance: ForwardReservationProvenanceIdentity;
    readonly trustedNow: number;
  }): Promise<ForwardAdmissionReservation>;
  prepareCommitment(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
  }): Promise<ForwardCommitment>;
  finalize(input: {
    reservation: ForwardAdmissionReservation;
    requestWire: PrivateOfficialAciRequestWire;
    confirmation: VerifiedCommitmentConfirmation;
  }): Promise<ForwardLease>;
  writeOnce(input: {
    readonly lease: ForwardLease;
    readonly confirmation: VerifiedCommitmentConfirmation;
    readonly trustedTime: TrustedTimeAuthorityPort;
    readonly channel: MutuallyAttestedChannel;
    readonly requestWire: PrivateOfficialAciRequestWire;
    readonly signal?: AbortSignal;
  }): Promise<AciChannelTransportResponse>;
  abort(input: {
    readonly context: AciTrustContext;
    readonly reservationId: string;
    readonly leaseId?: string;
    readonly reason: string;
  }): Promise<void>;
  recoverAfterRestart(input: { readonly context: AciTrustContext }): Promise<void>;
  cleanup(input: { readonly context: AciTrustContext; readonly trustedNow: number }): Promise<void>;
}

export type ForwardJournalState =
  | 'reserved'
  | 'commitment_pending'
  | 'commitment_confirmed'
  | 'lease_ready'
  | 'write_armed'
  | 'write_started'
  | 'response_pending'
  | 'consumed'
  | 'aborted'
  | 'quarantined';

export interface ForwardReplayScope {
  readonly orgId: string;
  readonly deploymentId: string;
  readonly bootEpoch: string;
  readonly proofId: string;
  readonly requestId: string;
}

export interface ForwardReplayJournalEntry {
  readonly scope: ForwardReplayScope;
  readonly state: ForwardJournalState;
  readonly reservation?: ForwardAdmissionReservation;
  readonly leaseId?: string;
  readonly commitmentTag?: string;
  readonly expiresAt?: number;
  readonly sequence: number;
  readonly previousTag: string;
  readonly entryTag: string;
}

export interface ForwardReplayJournalSnapshot {
  readonly sequence: number;
  readonly tailTag: string;
  readonly entries: readonly ForwardReplayJournalEntry[];
}

export interface ForwardReplayJournalPort {
  load(input: {
    readonly orgId: string;
    readonly deploymentId: string;
  }): Promise<ForwardReplayJournalSnapshot>;
  append(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly expectedSequence: number;
    readonly expectedTailTag: string;
    readonly entry: ForwardReplayJournalEntry;
  }): Promise<ForwardReplayJournalSnapshot>;
}

export interface ForwardReplayAuthorityPort {
  claimProof(input: ForwardReplayScope & { readonly expiresAt: number }): Promise<void>;
  releaseProof(input: ForwardReplayScope & { readonly expiresAt: number }): Promise<void>;
  reserve(input: ForwardProofReservation): Promise<ForwardAdmissionReservation>;
  prepareCommitment(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
  }): Promise<ForwardCommitment>;
  finalize(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
    readonly confirmation: VerifiedCommitmentConfirmation;
  }): Promise<ForwardLease>;
  consumeForWrite(input: {
    readonly lease: ForwardLease;
    readonly confirmation: VerifiedCommitmentConfirmation;
    readonly trustedTime: TrustedTimeAuthorityPort;
    readonly writeAtBoundary: (
      permit: ForwardWritePermit,
      signal?: AbortSignal,
    ) => AciChannelWriteOperation;
    readonly signal?: AbortSignal;
  }): Promise<AciChannelTransportResponse>;
  abort(input: {
    readonly context: AciTrustContext;
    readonly reservationId: string;
    readonly leaseId?: string;
    readonly reason: string;
  }): Promise<void>;
  recoverAfterRestart(input: { readonly context: AciTrustContext }): Promise<void>;
  cleanup(input: { readonly context: AciTrustContext; readonly trustedNow: number }): Promise<void>;
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

// SPDX-License-Identifier: Apache-2.0
export type {
  InferenceBackend,
  EmbedOptions,
  GenerateOptions,
  StructuredOptions,
  ToolSpec,
  AttestationReport,
  InferenceResponseVerifier,
  InferenceAttestationContext,
  InferenceTask,
  InferenceOperation,
  InferenceUsageEvent,
  InferenceUsageSink,
  InferenceExchangeEvidence,
  InferenceModelRole,
  AciEvidencePolicyAnchors,
  AciEvidenceVerifierPort,
  AciNativeEvidenceExpectationV2,
  AciNativeEvidenceVerificationInputV2,
  VerifiedAciEvidenceBindings,
  AciSessionEvidenceVerifierPort,
  VerifiedAciSessionEvidenceBindings,
  VerifiedAciSessionEvidenceBindingsV2,
  VerifiedAciChannelPin,
  VerifiedAciKeyset,
  AciReportVerifierConfig,
  AciRawEvidenceDigestAuthorityPort,
  AciSessionCandidate,
  AciSessionVerificationHighWater,
  AciSessionVerificationInput,
  VerifiedAciSession,
  VerifiedAciSessionSet,
  VerifiedAciTrustSnapshot,
  AciTrustContext,
  AciSessionVerifierConfig,
  AciReceiptVerificationInput,
  VerifiedAciReceipt,
  AciReceiptVerifierConfig,
  AciReceiptVerifierPort,
  AciReceiptReplayClaim,
  AciReceiptReplayStorePort,
  AciReceiptReplayPort,
  AciTrustHighWater,
  AciTrustHighWaterStorePort,
  AciKeysetHighWater,
  AciKeysetHighWaterPort,
  AciKeysetHighWaterAuthorityPort,
  ForwardAdmissionCapability,
  ForwardBodyOpenCapability,
  AciTrustStatePort,
  AciV2TrustStatePort,
  OfficialAciRequest,
  OfficialAciExchangeConfig,
  PreForwardRouteBinding,
  TrustedTimeReadContext,
  TrustedTimeSample,
  TrustedTimeBindingV1,
  TrustedTimeSampleV1,
  TrustedTimeAuthorityPort,
  TrustedTimeAuthorityV1Port,
  NsmAttestationDocumentV1,
  NsmTrustedTimeSourcePort,
  MonotonicRawClockPort,
  TrustedWriteBoundaryPort,
  TrustedTimeDecisionReason,
  PreForwardRouteProofVerificationInput,
  PreForwardRouteProofVerifierPort,
  PrivateOfficialAciRequestWire,
  MutuallyAttestedChannel,
  MutuallyAttestedChannelPort,
  ControlProofExchangePort,
  OfficialAciRequestWireSerializerPort,
  AciChannelTransportResponse,
  AciChannelTransport,
  AciChannelTransportPort,
  OfficialAciTransportPort,
  ForwardProofReservation,
  ForwardReservationProvenanceIdentity,
  ForwardAdmissionReservation,
  ForwardLease,
  ForwardLeaseStorePort,
  VerifiedPreForwardRouteProof,
  ObservedAciChannelBinding,
  ForwardCommitment,
  VerifiedCommitmentConfirmation,
  ForwardWritePermit,
  AciChannelWriteOperation,
  ForwardReplayScope,
  ForwardReplayAuthorityPort,
  ForwardJournalState,
  ForwardReplayJournalEntry,
  ForwardReplayJournalSnapshot,
  ForwardReplayJournalPort,
  ForwardCommitmentAuthenticatorPort,
} from './ports.js';
export { FORWARD_COMMITMENT_PROTOCOL } from './ports.js';
export { TeeEndpointBackend, type TeeEndpointConfig } from './TeeEndpointBackend.js';
export {
  OpenAICompatBackend,
  type InferenceModelSelection,
  type OpenAICompatConfig,
} from './OpenAICompatBackend.js';
export { StubInferenceBackend } from './StubInferenceBackend.js';
export { RoutingInferenceBackend, tieredTaskModels, type TaskModelMap } from './model-router.js';
export {
  createInferenceBackend,
  TEE_COMMISSIONING_PREREQUISITE,
  type InferenceConfig,
  type InferenceMode,
} from './factory.js';
export { DEFAULT_VERIFIED_MODELS, parseModelAllowlist } from './model-allowlist.js';
export {
  AciReceiptVerifier,
  InferenceAttestationError,
  ACI_RECEIPT_ID_HEADER,
  type AciVerifierConfig,
} from './aci-verifier.js';
export {
  AciReportVerifier,
  PublicAciReportVerifier,
  type PublicAciReportVerifierConfig,
} from './aci/AciReportVerifier.js';
export type {
  AciPublicQuoteVerifierPort,
  AciPublicQuoteObservations,
} from './aci/AciPublicQuotePolicyVerifier.js';
export { AciVerificationError, type AciVerificationErrorCode } from './aci/AciVerificationError.js';
export { AciSessionVerifier } from './aci/AciSessionVerifier.js';
export {
  PublicAciResponseVerifier,
  type PublicAciResponseVerifierConfig,
} from './aci/PublicAciResponseVerifier.js';
export {
  PublicAciSessionVerifier,
  type PublicAciSessionPolicy,
  type PublicAciSessionVerificationResult,
} from './aci/PublicAciSessionVerifier.js';
export {
  AciTrustState,
  AciTrustStateError,
  type AciTrustStateErrorCode,
} from './aci/AciTrustState.js';
export {
  AciSessionVerificationError,
  type AciSessionVerificationErrorCode,
} from './aci/AciSessionVerificationError.js';
export { AciReceiptVerifier as OfficialAciReceiptVerifier } from './aci/AciReceiptVerifier.js';
export {
  AciReceiptVerificationError as OfficialAciReceiptVerificationError,
  type AciReceiptVerificationErrorCode as OfficialAciReceiptVerificationErrorCode,
} from './aci/AciReceiptVerificationError.js';
export { OfficialAciExchange } from './aci/OfficialAciExchange.js';
export {
  OfficialAciExchangeError,
  type OfficialAciExchangeErrorCode,
} from './aci/OfficialAciExchangeError.js';
export {
  ForwardLeaseStore,
  ForwardLeaseStoreError,
  type ForwardLeaseStoreConfig,
  type ForwardLeaseStoreErrorCode,
} from './aci/ForwardLeaseStore.js';
export {
  PreForwardRouteProofVerifier,
  PreForwardRouteProofVerificationError,
  preForwardRouteProofPayload,
  type PreForwardRouteProofVerifierConfig,
} from './aci/PreForwardRouteProofVerifier.js';
export { NativeAciTransport } from './aci/NativeAciTransport.js';
export {
  DurableForwardReplayAuthority,
  type DurableForwardReplayAuthorityConfig,
} from './aci/DurableForwardReplayAuthority.js';
export { ForwardCommitmentAuthenticator } from './aci/ForwardCommitmentAuthenticator.js';
export {
  createForwardAdmissionRuntime,
  type ForwardAdmissionRuntime,
  type ForwardAdmissionRuntimeConfig,
} from './aci/ForwardAdmissionRuntime.js';
export {
  PreForwardAdmissionService,
  PreForwardAdmissionError,
  type PreForwardProofClaimInput,
  type ClaimedPreForwardAdmissionInput,
  type PreForwardAdmissionServiceConfig,
} from './aci/PreForwardAdmissionService.js';
export type { DurableGenerationHighWaterClientPort } from './ports.js';
export type {
  PreForwardRouteExpectation,
  ProviderNativeModelArtifactEvidenceV1,
  ProviderNativeArtifactEvidenceVerifierPort,
} from './ports.js';
export {
  brandCommissionedControlledRouteIdentityV1,
  isCommissionedControlledRouteIdentityV1,
} from './ports.js';
export type { PreForwardAdmissionBindingAuthorityPort } from './ports.js';
export {
  sha256DigestV1Schema,
  parseSha256DigestV1,
  mintSha256DigestV1,
  sha256DigestV1FromDigest64,
  digest64FromSha256DigestV1,
  fixedWidthSequenceV1Schema,
  s3ObjectVersionIdV1Schema,
  evidenceVersionTokenV1Schema,
  forwardAuthorityTokenV1Schema,
  forwardLeaseBindingDigestV1Schema,
  monotonicRawNanosecondsV1Schema,
  parseForwardAuthorityTokenV1,
  parseForwardLeaseBindingDigestV1,
  monotonicRawNanosecondsV1FromBigInt,
  bigintFromMonotonicRawNanosecondsV1,
  type Sha256DigestV1,
  type FixedWidthSequenceV1,
  type S3ObjectVersionIdV1,
  type EvidenceVersionTokenV1,
  type VersionedContentFreeRecordV1,
  type ForwardAuthorityTokenV1,
  type ForwardLeaseBindingDigestV1,
  type MonotonicRawNanosecondsV1,
} from './aci/official-aci-digests.js';
export {
  officialAciRequestDescriptorDigestV1Schema,
  createOfficialAciRequestDescriptor,
  assertOfficialAciRequestDescriptor,
  type OfficialAciRequestDescriptorDigestV1,
  type OfficialAciRequestDescriptorFieldsV1,
  type OfficialAciRequestDescriptorPreimageV1,
  type OfficialAciRequestDescriptorV1,
} from './aci/official-aci-request-descriptor.js';
export type {
  ProofClaimedForwardReplayRecordV1,
  ForwardReplayCanonicalStateV1,
  VersionedForwardState,
  ForwardAbsentCasV1,
  ForwardClaimProofInputV1,
  PreForwardProofClaimJournalPort,
} from './aci/official-aci-forward-records.js';
export type {
  OfficialAciR2AProvenanceDigestFactoryPort,
  ProductionVerifiedModelProvenanceDecisionPreimageV1,
  OfficialAciTrustContextV1,
  CommissionedControlledRouteIdentityV1,
} from './ports.js';

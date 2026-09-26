// SPDX-License-Identifier: Apache-2.0

/*
  The identity rule every infrastructure-operation consumer shares.

  An `operationId` is not chosen by a caller and is not random: it is a pure function of the
  operation's subject digest, `operationIdFromSubjectDigest(operationSubjectDigest)`. The control
  plane derives both when it builds a request, and a ledger record is self-describing only if the
  relation holds between its key and its content. Measured against four production records on
  2026-09-26 (the authority ledger's `operation/*` items for generations 45-48), it holds exactly,
  including the two records whose variant nibble is not `8`.

  Why the splicing lives here rather than in the control plane. It was private to
  `StepFunctionsInfrastructureOperationClient` and hand-copied once already, and the copy that got it
  wrong cost two generations: `attemptIdFor` in that file splices a literal `8` into the variant
  position, while this rule computes `(byte & 0x3f) | 0x80`, which preserves bit 0x40 and therefore
  yields `9`, `a` or `b` whenever that bit is set. Gen-42 and gen-44 both failed on that class of
  divergence. One implementation, one call site per consumer, and the embedded components that cannot
  import it are pinned against it by test.

  Two consequences of the shape. Both functions are total: callers turn a malformed digest into their
  own named refusal, because a throw here would put the refusal vocabulary in the wrong package. And
  `operationIdMatchesSubjectDigest` is the whole of the relation, so a consumer that needs to know a
  record's key is derived from its content checks that and nothing about the subject's shape -- which
  matters because the control plane builds the subject in two places with two different field sets.
*/

/** The subject digest is a sha256 hex digest; longer digests are truncated to the first 16 bytes. */
const SUBJECT_DIGEST_PATTERN = /^[0-9a-f]{32,}$/;

/** The operation id a subject digest denotes, or `undefined` when the digest is not one. */
export function operationIdFromSubjectDigest(subjectDigest: string): string | undefined {
  if (typeof subjectDigest !== 'string' || !SUBJECT_DIGEST_PATTERN.test(subjectDigest)) {
    return undefined;
  }
  const hex = subjectDigest.slice(0, 32);
  // Version nibble: byte 6's high nibble is forced to 8. Hex chars 12-13 are byte 6.
  // Variant nibble: byte 8 becomes `(byte & 0x3f) | 0x80`, which touches only its high nibble, so the
  // low nibble and the low two bits of the high nibble are preserved. Hex chars 16-17 are byte 8.
  const variantNibble = ((Number.parseInt(hex[16] as string, 16) & 0x3) | 0x8).toString(16);
  const id = hex.slice(0, 12) + '8' + hex.slice(13, 16) + variantNibble + hex.slice(17, 32);
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`;
}

/** Whether an operation id is the one the subject digest denotes. */
export function operationIdMatchesSubjectDigest(
  operationId: string,
  subjectDigest: string,
): boolean {
  return operationIdFromSubjectDigest(subjectDigest) === operationId;
}

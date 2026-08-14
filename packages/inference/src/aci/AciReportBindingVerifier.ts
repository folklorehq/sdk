// SPDX-License-Identifier: Apache-2.0
import { ECDH, createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import type { AciWorkloadReport } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { AciVerificationError } from './AciVerificationError.js';
import type { VerifiedAciEvidenceBindings } from '../ports.js';

const REPORT_DATA_PURPOSE = 'aci.report_data.v1';
const KEYSET_ENDORSEMENT_PURPOSE = 'aci.keyset.endorsement.v1';
const MAX_EVIDENCE_CANONICALIZATION_DEPTH = 32;
const MAX_EVIDENCE_CANONICALIZATION_NODES = 4_096;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
export type ExpectedAciEvidenceBindings = Pick<
  VerifiedAciEvidenceBindings,
  | 'workloadId'
  | 'nonce'
  | 'reportDataStatementDigest'
  | 'workloadKeysetDigest'
  | 'channelKeyDigest'
  | 'teeType'
  | 'imageDigest'
  | 'sourceRevision'
  | 'evidenceTranscriptDigest'
>;

interface ParsedPublicEvidence {
  readonly evidenceBytes: Uint8Array;
}

export class AciReportBindingVerifier {
  parseEvidence(value: unknown): ParsedPublicEvidence {
    if (!this.isCanonicalEvidenceValue(value, 0)) {
      throw new AciVerificationError('report_malformed');
    }
    const evidenceBytes = new TextEncoder().encode(canonicalJson(value));
    return { evidenceBytes };
  }

  verify(
    report: AciWorkloadReport,
    evidenceBytes: Uint8Array,
    nonce: Uint8Array,
  ): ExpectedAciEvidenceBindings {
    const workloadId = this.prefixedDigest(
      canonicalJson(report.attestation.workload_keyset.workload_identity.public_key),
    );
    if (report.workload_id !== workloadId) {
      throw new AciVerificationError('workload_id_mismatch');
    }
    const workloadKeysetDigest = this.prefixedDigest(
      canonicalJson(report.attestation.workload_keyset),
    );
    if (report.workload_keyset_digest !== workloadKeysetDigest) {
      throw new AciVerificationError('workload_keyset_digest_mismatch');
    }
    const nonceHex = Buffer.from(nonce).toString('hex');
    const reportDataStatementDigest = this.digest(
      canonicalJson({
        nonce: nonceHex,
        purpose: REPORT_DATA_PURPOSE,
        workload_id: workloadId,
        workload_keyset_digest: workloadKeysetDigest,
      }),
    );
    if (report.attestation.report_data !== reportDataStatementDigest) {
      throw new AciVerificationError('report_data_mismatch');
    }
    this.verifyEndorsement(report, workloadKeysetDigest);
    const channelKeyDigest = this.prefixedDigest(
      canonicalJson({
        e2ee_public_keys: report.attestation.workload_keyset.e2ee_public_keys,
        tls_public_keys: report.attestation.workload_keyset.tls_public_keys ?? [],
      }),
    );
    const sourceRevision = this.sourceRevision(report);
    return {
      workloadId,
      nonce: nonceHex,
      reportDataStatementDigest,
      workloadKeysetDigest,
      channelKeyDigest,
      teeType: report.attestation.tee_type,
      imageDigest: report.attestation.source_provenance.image_digest,
      sourceRevision,
      evidenceTranscriptDigest: this.prefixedDigest(evidenceBytes),
    };
  }

  private isCanonicalEvidenceValue(value: unknown, depth: number): boolean {
    const stack: Array<{ value: unknown; depth: number }> = [{ value, depth }];
    const seen = new WeakSet<object>();
    let nodes = 0;
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      nodes += 1;
      if (
        nodes > MAX_EVIDENCE_CANONICALIZATION_NODES ||
        current.depth > MAX_EVIDENCE_CANONICALIZATION_DEPTH
      ) {
        return false;
      }
      const item = current.value;
      if (item === null || typeof item === 'string' || typeof item === 'boolean') continue;
      if (typeof item === 'number') {
        if (!Number.isSafeInteger(item)) return false;
        continue;
      }
      if (typeof item !== 'object' || seen.has(item)) return false;
      seen.add(item);
      if (Array.isArray(item)) {
        if (Object.getPrototypeOf(item) !== Array.prototype) return false;
        for (let index = item.length - 1; index >= 0; index -= 1) {
          stack.push({ value: item[index], depth: current.depth + 1 });
        }
        continue;
      }
      const prototype = Object.getPrototypeOf(item);
      if (prototype !== Object.prototype && prototype !== null) return false;
      for (const child of Object.values(item)) {
        stack.push({ value: child, depth: current.depth + 1 });
      }
    }
    return true;
  }

  private verifyEndorsement(report: AciWorkloadReport, keysetDigest: string): void {
    const identityKey = report.attestation.workload_keyset.workload_identity.public_key;
    const payload = Buffer.from(
      canonicalJson({
        purpose: KEYSET_ENDORSEMENT_PURPOSE,
        workload_keyset_digest: keysetDigest,
      }),
    );
    const signature = Buffer.from(report.attestation.keyset_endorsement.value, 'hex');
    let isValid = false;
    try {
      if (identityKey.algo === 'ed25519') {
        const key = createPublicKey({
          format: 'der',
          key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(identityKey.public_key, 'hex')]),
          type: 'spki',
        });
        isValid = verifySignature(null, payload, key, signature);
      } else {
        const point = Buffer.from(
          ECDH.convertKey(
            Buffer.from(identityKey.public_key, 'hex'),
            'secp256k1',
            undefined,
            undefined,
            'uncompressed',
          ),
        );
        const key = createPublicKey({
          format: 'jwk',
          key: {
            crv: 'secp256k1',
            kty: 'EC',
            x: point.subarray(1, 33).toString('base64url'),
            y: point.subarray(33, 65).toString('base64url'),
          },
        });
        isValid = verifySignature('sha256', payload, { dsaEncoding: 'ieee-p1363', key }, signature);
      }
    } catch {
      isValid = false;
    }
    if (!isValid) throw new AciVerificationError('endorsement_invalid');
  }

  private sourceRevision(report: AciWorkloadReport): string {
    const provenance = report.attestation.source_provenance;
    return provenance.repo_commit ?? provenance.image_digest ?? '';
  }

  private digest(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private prefixedDigest(value: string | Uint8Array): string {
    return `sha256:${this.digest(value)}`;
  }
}

// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import type { AciWorkloadReport } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { AciVerificationError } from './AciVerificationError.js';
import type { VerifiedAciEvidenceBindings } from '../ports.js';

const REPORT_DATA_PURPOSE = 'aci.report_data.v1';
const MAX_EVIDENCE_CANONICALIZATION_DEPTH = 32;
const MAX_EVIDENCE_CANONICALIZATION_NODES = 4_096;
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
    const workloadKeysetDigest = this.prefixedDigest(
      canonicalJson(report.attestation.workload_keyset),
    );
    if (report.workload_keyset_digest !== workloadKeysetDigest) {
      throw new AciVerificationError('workload_keyset_digest_mismatch');
    }
    const nonceHex = Buffer.from(nonce).toString('hex');
    const reportDataStatementDigest = this.digest(
      canonicalJson({
        keyset_digest: workloadKeysetDigest,
        nonce: nonceHex,
        purpose: REPORT_DATA_PURPOSE,
      }),
    );
    if (report.attestation.report_data !== reportDataStatementDigest) {
      throw new AciVerificationError('report_data_mismatch');
    }
    const channelKeyDigest = this.prefixedDigest(
      canonicalJson({
        e2ee_public_keys: report.attestation.workload_keyset.e2ee_public_keys,
        tls_public_keys: report.attestation.workload_keyset.tls_public_keys ?? [],
      }),
    );
    const sourceRevision = this.sourceRevision(report);
    return {
      workloadId: workloadKeysetDigest,
      nonce: nonceHex,
      reportDataStatementDigest,
      workloadKeysetDigest,
      channelKeyDigest,
      teeType: report.attestation.tee_type,
      imageDigest: report.attestation.source_provenance?.image_digest ?? null,
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

  private sourceRevision(report: AciWorkloadReport): string {
    const provenance = report.attestation.source_provenance;
    return provenance?.repo_commit ?? provenance?.image_digest ?? '';
  }

  private digest(value: string | Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private prefixedDigest(value: string | Uint8Array): string {
    return `sha256:${this.digest(value)}`;
  }
}

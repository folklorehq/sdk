// SPDX-License-Identifier: Apache-2.0
// The per-tenant, non-guessable webhook ingest destination for a source (the `orgId` path is the
// tenant-isolation boundary, ADL #57). Caller owns the null-`ingestApiUrl` case.
export function ingestWebhookUrl(ingestApiUrl: string, orgId: string, kind: string): string {
  return `${ingestApiUrl.replace(/\/$/, '')}/ingest/${orgId}/${kind}`;
}

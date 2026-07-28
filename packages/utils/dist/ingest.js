// SPDX-License-Identifier: Apache-2.0
// The per-tenant, non-guessable webhook ingest destination for a source (the `orgId` path is the
// tenant-isolation boundary). Caller owns the null-`ingestApiUrl` case.
export function ingestWebhookUrl(ingestApiUrl, orgId, kind) {
    return `${ingestApiUrl.replace(/\/$/, '')}/ingest/${orgId}/${kind}`;
}
//# sourceMappingURL=ingest.js.map
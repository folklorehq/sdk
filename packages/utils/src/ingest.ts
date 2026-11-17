// SPDX-License-Identifier: Apache-2.0
// The per-tenant, non-guessable webhook ingest destination for a source (the `orgId` path is the
// tenant-isolation boundary). Caller owns the null-`ingestApiUrl` case.
export function ingestWebhookUrl(ingestApiUrl: string, orgId: string, kind: string): string {
  return `${ingestApiUrl.replace(/\/$/, '')}/ingest/${orgId}/${kind}`;
}

const PLATFORM_WEBHOOK_HOST = 'webhooks.folklorehq.com';

// Providers POST content to this origin, so anything but the exact platform host over https is refused.
export function platformWebhookOrigin(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const bare = url.pathname === '/' && url.search === '' && url.hash === '' && url.port === '';
  const trusted =
    url.protocol === 'https:' && url.hostname === PLATFORM_WEBHOOK_HOST && !url.username;
  return bare && trusted ? url.origin : null;
}

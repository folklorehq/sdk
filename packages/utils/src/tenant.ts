// SPDX-License-Identifier: Apache-2.0
export const SUBDOMAIN_LABEL_MIN_LENGTH = 3;
export const SUBDOMAIN_LABEL_MAX_LENGTH = 40;

// A single DNS label: lowercase alphanumeric with internal (never leading/trailing) hyphens.
const SUBDOMAIN_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

// Hosts owned by platform infrastructure — never assignable to a tenant, so a tenant can
// never shadow the console (apex/`www`), the box entry (`app`), or the control-plane API
// (`api`; `controlplane` stays reserved for the pre-#73 domain). Extend
// deliberately: removing a name here frees it for tenants.
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  'www',
  'app',
  'api',
  'controlplane',
  'control-plane',
  'admin',
  'console',
  'dashboard',
  'internal',
  'auth',
  'login',
  'billing',
  'status',
  'health',
  'static',
  'assets',
  'cdn',
  'mail',
  'smtp',
  'ftp',
  'ns',
  'nango',
  'ingest',
  'webhook',
  'webhooks',
  'docs',
  'help',
  'support',
  'blog',
]);

export function isValidSubdomainLabel(label: string): boolean {
  return (
    label.length >= SUBDOMAIN_LABEL_MIN_LENGTH &&
    label.length <= SUBDOMAIN_LABEL_MAX_LENGTH &&
    SUBDOMAIN_LABEL_RE.test(label)
  );
}

export function isReservedSubdomain(label: string): boolean {
  return RESERVED_SUBDOMAINS.has(label.toLowerCase());
}

/** A tenant subdomain is a valid DNS label that no platform host has reserved. */
export function isValidTenantSubdomain(label: string): boolean {
  return isValidSubdomainLabel(label) && !isReservedSubdomain(label);
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.$/, '');
}

/** The single tenant label under `rootDomain` (`acme` of `acme.folklorehq.com`), or null if not a tenant host. */
function labelUnderRoot(host: string, rootDomain: string): string | null {
  const suffix = `.${normalizeHost(rootDomain)}`;
  if (!host.endsWith(suffix)) return null;
  const label = host.slice(0, -suffix.length);
  return label.includes('.') ? null : label;
}

/** The leftmost label of a host with at least a label + registrable domain + TLD (3+ segments). */
function leadingLabel(host: string): string | null {
  const parts = host.split('.');
  if (parts.length < 3) return null;
  return parts[0] ?? null;
}

// The tenant subdomain label of a box host, or null for apex/reserved/localhost/non-tenant.
// Pass `rootDomain` to bind to a known apex; omitting it uses the leftmost label of a
// 3+-segment host, which mis-reads a multi-level host (`a.preview.<root>` → `a`) — so a
// multi-level env must pass its root.
export function resolveTenantFromHost(hostname: string, rootDomain?: string): string | null {
  const host = normalizeHost(hostname);
  if (!host) return null;
  const label = rootDomain ? labelUnderRoot(host, rootDomain) : leadingLabel(host);
  if (label === null) return null;
  return isValidTenantSubdomain(label) ? label : null;
}

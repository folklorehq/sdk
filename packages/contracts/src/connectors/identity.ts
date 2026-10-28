// SPDX-License-Identifier: Apache-2.0
import type { z } from 'zod';
import type { ConnectorManifest, identityLookupSchema } from './manifest.js';
import { PRIVATE_CONNECTOR_MANIFESTS } from './private-registry.js';
import { PUBLIC_CONNECTOR_MANIFESTS } from './public-registry.js';

export interface IdentityLinkSpec {
  readonly kind: string;
  readonly live: boolean;
  readonly authUrl: string;
  readonly scopes: readonly string[];
  readonly scopeParam: 'scope' | 'user_scope';
  readonly pkce: 'required' | 'disabled';
  readonly clientIdEnvs: readonly string[];
  readonly extraAuthParams?: Readonly<Record<string, string>>;
  readonly lookup: z.infer<typeof identityLookupSchema>;
}

const COMPILED: readonly ConnectorManifest[] = [
  ...PUBLIC_CONNECTOR_MANIFESTS,
  ...PRIVATE_CONNECTOR_MANIFESTS,
];

function specOf(manifest: ConnectorManifest): IdentityLinkSpec | null {
  const identity = manifest.identity;
  if (!identity) return null;
  const sourceEnv =
    identity.fallbackToSource && manifest.auth?.type === 'oauth2'
      ? [manifest.auth.clientIdEnv]
      : [];
  return {
    kind: manifest.kind,
    live: identity.live,
    authUrl: identity.authUrl,
    scopes: identity.scopes,
    scopeParam: identity.scopeParam,
    pkce: identity.pkce,
    clientIdEnvs: [...(identity.clientIdEnv ? [identity.clientIdEnv] : []), ...sourceEnv],
    ...(identity.extraAuthParams ? { extraAuthParams: identity.extraAuthParams } : {}),
    lookup: identity.lookup,
  };
}

export function identityLinkSpecs(): readonly IdentityLinkSpec[] {
  return COMPILED.flatMap((manifest) => specOf(manifest) ?? []);
}

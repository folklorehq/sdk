// SPDX-License-Identifier: Apache-2.0
import { canonicalJson } from '@folklore/utils/canonical-json-pure';
import { sha256Hex } from './firstparty-digest.js';
import type { FirstpartyDefinition } from './firstparty-definition.js';

export const FIRSTPARTY_RECONNECT_REASONS = ['streams_changed', 'sharing_rules_changed'] as const;
export type FirstpartyReconnectReason = (typeof FIRSTPARTY_RECONNECT_REASONS)[number];

type FirstpartyAuth = FirstpartyDefinition['auth'];

export interface FirstpartyConnectionSurface {
  readonly mode: FirstpartyAuth['mode'];
  readonly authorizeUrl: string;
  readonly tokenUrl: string;
  readonly tokenEndpointAuth: FirstpartyAuth['tokenEndpointAuth'];
  readonly clientId: string;
  readonly pkce: FirstpartyAuth['pkce'];
  readonly refresh: boolean;
  readonly scopes: readonly string[];
  readonly extraAuthParams: Readonly<Record<string, string>>;
  readonly hosts: {
    readonly authorize: string;
    readonly api: readonly string[];
    readonly token: string;
  };
}

export function firstpartyConnectionSurface(
  definition: FirstpartyDefinition,
): FirstpartyConnectionSurface {
  const { auth, hosts } = definition;
  return {
    mode: auth.mode,
    authorizeUrl: auth.authorizeUrl,
    tokenUrl: auth.tokenUrl,
    tokenEndpointAuth: auth.tokenEndpointAuth,
    clientId: auth.clientId,
    pkce: auth.pkce,
    refresh: auth.refresh,
    scopes: [...auth.scopes].sort(),
    extraAuthParams: auth.extraAuthParams ?? {},
    hosts: { authorize: hosts.authorize, api: [...hosts.api].sort(), token: hosts.token },
  };
}

export const firstpartySurfaceDigest = (definition: FirstpartyDefinition): string =>
  sha256Hex(canonicalJson(firstpartyConnectionSurface(definition)));

const streamDigest = (definition: FirstpartyDefinition): string =>
  sha256Hex(
    canonicalJson(
      definition.spec.streams.map((stream) => [
        stream.name,
        stream.mapping && 'sensitivity' in stream.mapping ? stream.mapping.sensitivity : null,
      ]),
    ),
  );

export function firstpartyCredentialBinding(
  definition: FirstpartyDefinition,
  definitionId: string,
): string {
  const { auth, hosts } = definition;
  const apiHosts = [...hosts.api].sort().join(',');
  return sha256Hex(
    `${auth.mode}|${apiHosts}|${hosts.token}|${definitionId}|${streamDigest(definition)}`,
  );
}

const sortedStreamNames = (definition: FirstpartyDefinition): string =>
  definition.spec.streams
    .map((stream) => stream.name)
    .sort()
    .join(',');

export function firstpartyReconnectReason(
  previous: FirstpartyDefinition,
  next: FirstpartyDefinition,
  definitionId: string,
): FirstpartyReconnectReason | null {
  const unchanged =
    firstpartyCredentialBinding(previous, definitionId) ===
    firstpartyCredentialBinding(next, definitionId);
  if (unchanged) return null;
  return sortedStreamNames(previous) === sortedStreamNames(next)
    ? 'sharing_rules_changed'
    : 'streams_changed';
}

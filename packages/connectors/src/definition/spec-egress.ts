// SPDX-License-Identifier: Apache-2.0
import type { ConnectorManifest } from '@folklore/contracts';
import { ConnectorSpecError } from '@folklore/errors';

export function parseSpecUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    throw new ConnectorSpecError('egress_host_refused');
  }
}

export function assertSpecUrl(
  url: URL,
  manifest: ConnectorManifest,
  specOrigin: string | null,
): void {
  const allowed =
    url.protocol === 'https:' &&
    url.username === '' &&
    url.password === '' &&
    url.port === '' &&
    manifest.egress.apiHosts.includes(url.hostname) &&
    (specOrigin === null || url.origin === specOrigin);
  if (!allowed) throw new ConnectorSpecError('egress_host_refused');
}

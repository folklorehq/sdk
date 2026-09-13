// SPDX-License-Identifier: Apache-2.0
const ACCESSIBLE_RESOURCES_URL = 'https://api.atlassian.com/oauth/token/accessible-resources';

type AtlassianProduct = 'jira' | 'confluence';

interface AccessibleResource {
  id: string;
  url: string;
}

export async function resolveAtlassianCloudId(
  token: string,
  configuredCloudId: string | null | undefined,
  product: AtlassianProduct,
): Promise<string> {
  if (configuredCloudId) return configuredCloudId;

  const res = await fetch(ACCESSIBLE_RESOURCES_URL, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw Object.assign(new Error(`${product} accessible-resources failed: ${res.status}`), {
      status: res.status,
    });
  }

  const resources = (await res.json()) as AccessibleResource[];
  const first = resources[0];
  if (!first) throw new Error(`${product}: no accessible Atlassian site for this token`);
  // Never guess a multi-site token: choosing the wrong site could ingest the wrong tenant.
  if (resources.length > 1) {
    throw new Error(
      `${product}: token grants ${resources.length} sites; a cloudId must be configured to disambiguate`,
    );
  }
  return first.id;
}

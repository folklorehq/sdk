// SPDX-License-Identifier: Apache-2.0
import type { PullResult } from '../../src/connector.js';

export function serializeLinearGolden(pulls: readonly PullResult[]): string {
  return JSON.stringify(
    {
      pulls: pulls.map((result) => ({
        facts: [...result.facts].sort(
          (a, b) => a.sourceFactId.localeCompare(b.sourceFactId) || a.kind.localeCompare(b.kind),
        ),
        containers: [...result.containers].sort((a, b) =>
          a.sourceContainerId.localeCompare(b.sourceContainerId),
        ),
        cursor: result.cursor,
        hasMore: result.hasMore,
      })),
    },
    null,
    2,
  ).concat('\n');
}

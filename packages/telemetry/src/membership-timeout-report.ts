// SPDX-License-Identifier: Apache-2.0
import { TelemetryEvent, type AudienceMembershipTelemetryReader } from './events.js';
import type { TelemetryClient } from './ports.js';

// Matches @folklore/wiki's MembershipTimeoutReport structurally, since wiki does not depend on telemetry.
export function membershipTimeoutReport(client: TelemetryClient) {
  return (
    orgId: string,
    event: { reader: AudienceMembershipTelemetryReader; count: number },
  ): void => client.track(TelemetryEvent.AudienceMembershipTimeout, orgId, event);
}

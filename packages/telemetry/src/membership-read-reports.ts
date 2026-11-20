// SPDX-License-Identifier: Apache-2.0
import {
  TelemetryEvent,
  type AudienceMembershipBusyReader,
  type AudienceMembershipTelemetryReader,
} from './events.js';
import type { TelemetryClient } from './ports.js';

// Matches @folklore/wiki's MembershipTimeoutReport structurally, since wiki does not depend on telemetry.
export function membershipTimeoutReport(client: TelemetryClient) {
  return (
    orgId: string,
    event: { reader: AudienceMembershipTelemetryReader; count: number },
  ): void => client.track(TelemetryEvent.AudienceMembershipTimeout, orgId, event);
}

const BUSY_REPORT_INTERVAL_MS = 60_000;

// Once per org and reader per interval in this process, so a script cannot flood telemetry.
export function membershipBusyReport(client: TelemetryClient, now: () => number = Date.now) {
  const reportedAt = new Map<string, number>();
  return (orgId: string, event: { reader: AudienceMembershipBusyReader }): void => {
    const key = `${orgId}:${event.reader}`;
    const last = reportedAt.get(key);
    if (last !== undefined && now() - last < BUSY_REPORT_INTERVAL_MS) return;
    reportedAt.set(key, now());
    client.track(TelemetryEvent.AudienceMembershipBusy, orgId, { orgId, ...event });
  };
}

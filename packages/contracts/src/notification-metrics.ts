// SPDX-License-Identifier: Apache-2.0
/** The CloudWatch metric a pool's notification sender emits when it defers mail because an org has no workspace label yet. */
export const NOTIFICATION_ORIGIN_UNRESOLVED_METRIC = {
  namespace: 'Folklore/Pool',
  name: 'NotificationOriginUnresolved',
  poolDimension: 'PoolId',
} as const;

/** The sender is quiet for a while after deferring, so "sustained" is this many consecutive periods each with at least one deferral. */
export const NOTIFICATION_ORIGIN_UNRESOLVED_ALARM = {
  periodSeconds: 900,
  evaluationPeriods: 4,
} as const;

/** The CloudWatch metric a pool's notification sender emits for mail it settled unsent because it was older than the staleness cutoff; a count only. */
export const NOTIFICATION_EXPIRED_METRIC = {
  namespace: 'Folklore/Pool',
  name: 'NotificationExpired',
  poolDimension: 'PoolId',
} as const;

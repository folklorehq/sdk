// SPDX-License-Identifier: Apache-2.0
import {
  digest64Schema,
  identifierSchema,
  trustedTimeSampleV1Schema,
  type TrustedTimeSampleV1,
} from '@folklore/contracts';
import type {
  AciTrustContext,
  TrustedTimeAuthorityPort,
  TrustedTimeAuthorityV1Port,
  TrustedTimeReadContext,
  TrustedTimeSample,
} from '../ports.js';

const MILLISECONDS_PER_SECOND = 1_000;

export function isTrustedTimeContext(value: unknown): value is AciTrustContext {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return (
    identifierSchema.safeParse(context['orgId']).success &&
    identifierSchema.safeParse(context['deploymentId']).success &&
    identifierSchema.safeParse(context['bootEpoch']).success &&
    digest64Schema.safeParse(context['checkpointDigest']).success
  );
}

export async function readTrustedTimeSample(
  authority: TrustedTimeAuthorityPort,
  context: TrustedTimeReadContext = {},
): Promise<TrustedTimeSample> {
  const sample = isV1Authority(authority)
    ? toLegacyTrustedTimeSample(await authority.sample('proof'))
    : await authority.read(context);
  if (!isTrustedTimeSample(sample)) throw new Error('trusted_time_unavailable');
  assertTrustedTimeContext(sample, context);
  return sample;
}

function isV1Authority(
  authority: TrustedTimeAuthorityPort,
): authority is TrustedTimeAuthorityV1Port {
  const candidate = authority as Partial<TrustedTimeAuthorityV1Port>;
  return (
    typeof candidate.initialize === 'function' &&
    typeof candidate.sample === 'function' &&
    typeof candidate.isHealthy === 'function'
  );
}

function toLegacyTrustedTimeSample(sample: TrustedTimeSampleV1): TrustedTimeSample {
  if (!isTrustedTimeSampleV1(sample)) throw new Error('trusted_time_sample_invalid');
  const trustedNow = Math.floor(sample.trustedNowMs / MILLISECONDS_PER_SECOND);
  if (!Number.isSafeInteger(trustedNow) || trustedNow <= 0) {
    throw new Error('trusted_time_sample_invalid');
  }
  return {
    trustedNow,
    checkpointDigest: sample.checkpointDigest,
    bootEpoch: sample.bootEpoch,
    orgId: sample.orgId,
    deploymentId: sample.deploymentId,
  };
}

function assertTrustedTimeContext(
  sample: TrustedTimeSample,
  context: TrustedTimeReadContext,
): void {
  if (context.orgId !== undefined && sample.orgId !== context.orgId) throw new Error();
  if (context.deploymentId !== undefined && sample.deploymentId !== context.deploymentId) {
    throw new Error();
  }
  if (context.bootEpoch !== undefined && sample.bootEpoch !== context.bootEpoch) throw new Error();
  if (
    context.checkpointDigest !== undefined &&
    sample.checkpointDigest !== context.checkpointDigest
  ) {
    throw new Error();
  }
}

export function isTrustedTimeSampleV1(value: unknown): value is TrustedTimeSampleV1 {
  return trustedTimeSampleV1Schema.safeParse(value).success;
}

function isTrustedTimeSample(value: unknown): value is TrustedTimeSample {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const sample = value as Record<string, unknown>;
  const trustedNow = sample['trustedNow'];
  const checkpointDigest = sample['checkpointDigest'];
  const bootEpoch = sample['bootEpoch'];
  const orgId = sample['orgId'];
  const deploymentId = sample['deploymentId'];
  return (
    typeof trustedNow === 'number' &&
    Number.isSafeInteger(trustedNow) &&
    trustedNow > 0 &&
    digest64Schema.safeParse(checkpointDigest).success &&
    identifierSchema.safeParse(bootEpoch).success &&
    identifierSchema.safeParse(orgId).success &&
    identifierSchema.safeParse(deploymentId).success
  );
}

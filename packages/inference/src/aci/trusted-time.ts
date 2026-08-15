// SPDX-License-Identifier: Apache-2.0
import type {
  AciTrustContext,
  TrustedTimeAuthorityPort,
  TrustedTimeReadContext,
  TrustedTimeSample,
} from '../ports.js';

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DIGEST = /^[0-9a-f]{64}$/;

export function isTrustedTimeContext(value: unknown): value is AciTrustContext {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  return (
    typeof context['orgId'] === 'string' &&
    IDENTIFIER.test(context['orgId']) &&
    typeof context['deploymentId'] === 'string' &&
    IDENTIFIER.test(context['deploymentId']) &&
    typeof context['bootEpoch'] === 'string' &&
    IDENTIFIER.test(context['bootEpoch']) &&
    typeof context['checkpointDigest'] === 'string' &&
    DIGEST.test(context['checkpointDigest'])
  );
}

export async function readTrustedTimeSample(
  authority: TrustedTimeAuthorityPort,
  context: TrustedTimeReadContext = {},
): Promise<TrustedTimeSample> {
  const sample = await authority.read(context);
  if (!isTrustedTimeSample(sample)) throw new Error();
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
  return sample;
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
    typeof checkpointDigest === 'string' &&
    DIGEST.test(checkpointDigest) &&
    typeof bootEpoch === 'string' &&
    IDENTIFIER.test(bootEpoch) &&
    typeof orgId === 'string' &&
    IDENTIFIER.test(orgId) &&
    typeof deploymentId === 'string' &&
    IDENTIFIER.test(deploymentId)
  );
}

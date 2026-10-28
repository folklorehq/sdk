// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  INFERENCE_USAGE_DISCARDED_MAX_COUNT,
  INFERENCE_USAGE_DISCARDED_MAX_ENTRIES,
  inferenceUsageDiscardedSchema,
} from '../src/enclave.js';
import { enclaveOutputBindingForPayload, enclaveOutputTypeSchema } from '../src/enclave-output.js';

const usage = {
  model: 'claude-sonnet-5-5',
  operation: 'generate',
  calls: 1,
  promptTokens: 10,
  completionTokens: 2,
};

const REQUEST_ID = 'a'.repeat(64);
const MESSAGE_ID = '3f2b8c1e-9d4a-4e7b-8a21-5c6d7e8f9a0b';
const OTHER_MESSAGE_ID = '7a1c2d3e-4f50-4a6b-9c7d-8e9f0a1b2c3d';

const payload = {
  type: 'inference_usage_discarded',
  orgId: 'org-1',
  requestId: REQUEST_ID,
  messageId: MESSAGE_ID,
  attempt: 2,
  tokenUsage: [usage],
};

const identity = { deploymentId: 'deployment-1', assignmentGeneration: 7, nonce: '11'.repeat(32) };

describe('inferenceUsageDiscardedSchema', () => {
  it('parses a run with its message, attempt and usage', () => {
    expect(inferenceUsageDiscardedSchema.safeParse(payload).success).toBe(true);
  });

  it.each([
    ['unknown key', { ...payload, text: 'x' }],
    ['zero attempt', { ...payload, attempt: 0 }],
    ['fractional attempt', { ...payload, attempt: 1.5 }],
    ['missing attempt', { ...payload, attempt: undefined }],
    ['empty request id', { ...payload, requestId: '' }],
    ['request id that is not a sha-256 digest', { ...payload, requestId: 'req-1' }],
    ['upper-case request id', { ...payload, requestId: 'A'.repeat(64) }],
    ['oversize request id', { ...payload, requestId: 'a'.repeat(65) }],
    ['missing message id', { ...payload, messageId: undefined }],
    ['message id that is not an SQS id', { ...payload, messageId: 'message-1' }],
    ['message id with prose', { ...payload, messageId: 'the payments team cut over' }],
    ['negative token count', { ...payload, tokenUsage: [{ ...usage, promptTokens: -1 }] }],
    [
      'prompt count past the bound',
      {
        ...payload,
        tokenUsage: [{ ...usage, promptTokens: INFERENCE_USAGE_DISCARDED_MAX_COUNT + 1 }],
      },
    ],
    ['non-finite-looking call count', { ...payload, tokenUsage: [{ ...usage, calls: 1e300 }] }],
    [
      'cache read count past the bound',
      { ...payload, tokenUsage: [{ ...usage, cacheReadTokens: 1e300 }] },
    ],
    ['extra usage key', { ...payload, tokenUsage: [{ ...usage, note: 'x' }] }],
    ['other type', { ...payload, type: 'wiki_synthesis_deferred' }],
  ])('refuses the whole output for %s', (_name, value) => {
    expect(inferenceUsageDiscardedSchema.safeParse(value).success).toBe(false);
  });

  it('accepts counts up to the bound', () => {
    const tokenUsage = [{ ...usage, promptTokens: INFERENCE_USAGE_DISCARDED_MAX_COUNT }];

    expect(inferenceUsageDiscardedSchema.safeParse({ ...payload, tokenUsage }).success).toBe(true);
  });

  it('refuses more entries than one run can produce', () => {
    const tokenUsage = Array.from(
      { length: INFERENCE_USAGE_DISCARDED_MAX_ENTRIES + 1 },
      () => usage,
    );

    expect(inferenceUsageDiscardedSchema.safeParse({ ...payload, tokenUsage }).success).toBe(false);
  });
});

describe('inference_usage_discarded output binding', () => {
  it('is a listed output type', () => {
    expect(enclaveOutputTypeSchema.options.at(-1)).toBe('inference_usage_discarded');
  });

  it('binds one output id per request, message and attempt', () => {
    const first = enclaveOutputBindingForPayload({ ...payload, attempt: 1 }, identity);
    const second = enclaveOutputBindingForPayload(payload, identity);
    const resent = enclaveOutputBindingForPayload(
      { ...payload, attempt: 1, messageId: OTHER_MESSAGE_ID },
      identity,
    );

    expect(second.outputType).toBe('inference_usage_discarded');
    expect(second.outputId).toBe(`${REQUEST_ID}:discarded:${MESSAGE_ID}:2`);
    expect(first.outputId).toBe(`${REQUEST_ID}:discarded:${MESSAGE_ID}:1`);
    expect(resent.outputId).not.toBe(first.outputId);
    expect(second.resourceIds).toEqual([REQUEST_ID]);
    expect(second.orgId).toBe('org-1');
  });

  it.each([
    ['request id', { ...payload, requestId: undefined }],
    ['message id', { ...payload, messageId: undefined }],
    ['attempt', { ...payload, attempt: undefined }],
    ['zero attempt', { ...payload, attempt: 0 }],
    ['string attempt', { ...payload, attempt: '2' }],
    ['org id', { ...payload, orgId: undefined }],
  ])('refuses a payload without a valid %s', (_name, value) => {
    expect(() => enclaveOutputBindingForPayload(value, identity)).toThrow();
  });
});

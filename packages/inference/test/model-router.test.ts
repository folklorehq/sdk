// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { RoutingInferenceBackend, tieredTaskModels } from '../src/model-router.js';
import type { AttestationReport, GenerateOptions, InferenceBackend } from '../src/ports.js';

function fakeBackend(overrides: Partial<InferenceBackend> = {}): InferenceBackend {
  return {
    embed: vi.fn().mockResolvedValue([1]),
    generate: vi.fn().mockResolvedValue('out'),
    async *stream() {
      yield 'tok';
    },
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const SMALL = 'qwen2.5:1.5b';
const LARGE = 'qwen2.5:32b';

describe('tieredTaskModels()', () => {
  it('maps cheap tasks to the small model and leaves synthesis unset without a large model', () => {
    const map = tieredTaskModels(SMALL);
    expect(map.labeling).toBe(SMALL);
    expect(map['noise-filter']).toBe(SMALL);
    expect(map.classification).toBe(SMALL);
    expect(map.extraction).toBe(SMALL);
    expect(map.synthesis).toBeUndefined();
    expect(map.query).toBeUndefined();
  });

  it('maps synthesis/query to the large model when provided', () => {
    const map = tieredTaskModels(SMALL, LARGE);
    expect(map.synthesis).toBe(LARGE);
    expect(map.query).toBe(LARGE);
  });

  it('maps only the large tiers when no small model is provided', () => {
    const map = tieredTaskModels(undefined, LARGE);
    expect(map.synthesis).toBe(LARGE);
    expect(map.query).toBe(LARGE);
    expect(map.labeling).toBeUndefined();
    expect(map.extraction).toBeUndefined();
  });

  it('maps nothing when neither tier is provided', () => {
    expect(tieredTaskModels()).toEqual({});
  });
});

describe('RoutingInferenceBackend', () => {
  it('substitutes the task model when no explicit model is given', async () => {
    const base = fakeBackend();
    const routed = new RoutingInferenceBackend(base, tieredTaskModels(SMALL, LARGE));

    await routed.generate('p', { task: 'labeling' });

    expect(base.generate).toHaveBeenCalledWith('p', { task: 'labeling', model: SMALL });
  });

  it('respects an explicit model over the task mapping', async () => {
    const base = fakeBackend();
    const routed = new RoutingInferenceBackend(base, tieredTaskModels(SMALL, LARGE));

    await routed.generate('p', { task: 'labeling', model: 'override' });

    expect(base.generate).toHaveBeenCalledWith('p', { task: 'labeling', model: 'override' });
  });

  it('passes options through unchanged when there is no task', async () => {
    const base = fakeBackend();
    const routed = new RoutingInferenceBackend(base, tieredTaskModels(SMALL));

    await routed.generate('p', { temperature: 0.2 });

    expect(base.generate).toHaveBeenCalledWith('p', { temperature: 0.2 });
  });

  it('leaves the model default when the task has no mapping', async () => {
    const base = fakeBackend();
    const routed = new RoutingInferenceBackend(base, tieredTaskModels(SMALL)); // no large model

    const opts: GenerateOptions = { task: 'synthesis' };
    await routed.generate('p', opts);

    expect(base.generate).toHaveBeenCalledWith('p', { task: 'synthesis' });
  });

  it('delegates embeddings without routing', async () => {
    const base = fakeBackend();
    const routed = new RoutingInferenceBackend(base, tieredTaskModels(SMALL));
    await routed.embed('text');
    expect(base.embed).toHaveBeenCalledWith('text', undefined);
  });

  it('exposes getAttestationReport only when the base backend has one', async () => {
    const report: AttestationReport = { quote: 'q', timestamp: 't' };
    const withAttest = fakeBackend({ getAttestationReport: vi.fn().mockResolvedValue(report) });
    const routedWith = new RoutingInferenceBackend(withAttest, {});
    expect(typeof routedWith.getAttestationReport).toBe('function');
    await expect(routedWith.getAttestationReport!()).resolves.toEqual(report);

    const routedWithout = new RoutingInferenceBackend(fakeBackend(), {});
    expect(routedWithout.getAttestationReport).toBeUndefined();
  });
});

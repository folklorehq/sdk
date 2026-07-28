// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ShutdownManager } from '../src/index.js';

describe('ShutdownManager', () => {
  it('runs registered handlers in LIFO order', async () => {
    const order: number[] = [];
    const manager = new ShutdownManager();
    manager.register(() => void order.push(1));
    manager.register(async () => void order.push(2));

    await manager.shutdown();

    expect(order).toEqual([2, 1]);
  });

  it('continues past a throwing handler and reports it', async () => {
    const errors: unknown[] = [];
    let lastRan = false;
    const manager = new ShutdownManager({ onError: (e) => void errors.push(e) });
    manager.register(() => void (lastRan = true));
    manager.register(() => {
      throw new Error('boom');
    });

    await manager.shutdown();

    expect(errors).toHaveLength(1);
    expect(lastRan).toBe(true);
  });

  it('only runs once', async () => {
    let count = 0;
    const manager = new ShutdownManager();
    manager.register(() => void (count += 1));

    await manager.shutdown();
    await manager.shutdown();

    expect(count).toBe(1);
  });
});

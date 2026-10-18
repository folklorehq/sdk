// SPDX-License-Identifier: Apache-2.0
import { LinearRateLimitedError, LinearRequestError, type LinearWindow } from './client.js';
import type { LinearEmitBounds } from './normalize.js';
import type { LinearSlice, LinearStreamPosition } from './pull-cursor.js';
import type { LinearPage } from './types.js';

export const SLICE_SAFETY_LAG_MS = 2 * 60_000;

export type LinearStreamStop = 'caught_up' | 'budget' | 'guard' | 'rate_limited';

export interface LinearStreamResult {
  readonly position: LinearStreamPosition;
  readonly spent: number;
  readonly stop: LinearStreamStop;
}

export interface LinearStreamInput<T extends { readonly id: string }> {
  readonly fetchPage: (window: LinearWindow, after: string | null) => Promise<LinearPage<T>>;
  readonly position: LinearStreamPosition;
  readonly floorMs: number;
  readonly startedAtMs: number;
  readonly budget: number;
  readonly guard: () => boolean;
  readonly emit: (node: T, bounds: LinearEmitBounds) => Promise<number>;
  readonly collectedBefore: number;
  readonly discardCollected: () => void;
}

class LinearStreamRun<T extends { readonly id: string }> {
  private spent = 0;
  private hasRetriedCursor = false;
  private readonly bounds: LinearEmitBounds;

  constructor(
    private readonly input: LinearStreamInput<T>,
    private readonly lower: number,
    private slice: LinearSlice,
  ) {
    this.bounds = {
      emitAfterMs: input.position.emitAfter ?? input.floorMs - 1,
      floorMs: input.floorMs,
    };
  }

  async run(): Promise<LinearStreamResult> {
    for (;;) {
      try {
        return await this.consume();
      } catch (error) {
        if (this.isRateLimitedWithProgress(error)) return this.unchanged();
        throw error;
      }
    }
  }

  private async consume(): Promise<LinearStreamResult> {
    for (;;) {
      if (this.input.guard()) return this.stopped('guard');
      const page = await this.fetchCurrentPage();
      const budgetStop = await this.consumePage(page);
      if (budgetStop) return budgetStop;
      if (!page.pageInfo.hasNextPage || page.pageInfo.endCursor === null) {
        return this.completed('caught_up');
      }
      this.slice = { ...this.slice, after: page.pageInfo.endCursor, lastId: null };
    }
  }

  private async fetchCurrentPage(): Promise<LinearPage<T>> {
    for (;;) {
      try {
        return await this.input.fetchPage(
          { gtMs: this.lower, lteMs: this.slice.untilMs },
          this.slice.after,
        );
      } catch (error) {
        if (!this.isStaleCursor(error)) throw error;
        this.resetCursor();
      }
    }
  }

  private async consumePage(page: LinearPage<T>): Promise<LinearStreamResult | null> {
    for (let index = this.resumeIndex(page.nodes); index < page.nodes.length; index += 1) {
      const node = page.nodes[index];
      if (node === undefined) continue;
      this.spent += await this.input.emit(node, this.bounds);
      if (this.spent >= this.input.budget) return this.budgetStop(page, node);
    }
    return null;
  }

  private resumeIndex(nodes: readonly T[]): number {
    if (this.slice.lastId === null) return 0;
    const taken = nodes.findIndex((node) => node.id === this.slice.lastId);
    return taken < 0 ? 0 : taken + 1;
  }

  private budgetStop(page: LinearPage<T>, node: T): LinearStreamResult {
    const isLastNode = page.nodes[page.nodes.length - 1]?.id === node.id;
    if (!isLastNode) {
      this.slice = { ...this.slice, lastId: node.id };
      return this.stopped('budget');
    }
    if (page.pageInfo.hasNextPage && page.pageInfo.endCursor !== null) {
      this.slice = { ...this.slice, after: page.pageInfo.endCursor, lastId: null };
      return this.stopped('budget');
    }
    return this.completed('budget');
  }

  private isStaleCursor(error: unknown): boolean {
    return (
      error instanceof LinearRequestError &&
      error.code === 'linear_cursor_invalid' &&
      this.slice.after !== null &&
      !this.hasRetriedCursor
    );
  }

  private resetCursor(): void {
    this.hasRetriedCursor = true;
    this.spent = 0;
    this.input.discardCollected();
    this.slice = { ...this.slice, after: null, lastId: null };
  }

  private isRateLimitedWithProgress(error: unknown): boolean {
    return error instanceof LinearRateLimitedError && this.spent + this.input.collectedBefore > 0;
  }

  private unchanged(): LinearStreamResult {
    return { position: this.input.position, spent: this.spent, stop: 'rate_limited' };
  }

  private stopped(stop: LinearStreamStop): LinearStreamResult {
    const { wm, emitAfter } = this.input.position;
    return { position: { wm, emitAfter, slice: this.slice }, spent: this.spent, stop };
  }

  private completed(stop: LinearStreamStop): LinearStreamResult {
    return {
      position: { wm: this.slice.untilMs, emitAfter: this.lower, slice: null },
      spent: this.spent,
      stop,
    };
  }
}

/** Reads one stream's window page by page; a budget stop resumes at the node after the last one taken. */
export async function readLinearStream<T extends { readonly id: string }>(
  input: LinearStreamInput<T>,
): Promise<LinearStreamResult> {
  const lower = input.position.wm ?? input.floorMs - 1;
  const slice = input.position.slice ?? openSlice(lower, input.startedAtMs);
  if (slice === null) return { position: input.position, spent: 0, stop: 'caught_up' };
  return new LinearStreamRun(input, lower, slice).run();
}

function openSlice(lower: number, startedAtMs: number): LinearSlice | null {
  const untilMs = startedAtMs - SLICE_SAFETY_LAG_MS;
  return lower >= untilMs ? null : { untilMs, after: null, lastId: null };
}

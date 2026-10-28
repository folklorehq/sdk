// SPDX-License-Identifier: Apache-2.0
import type { SpecStreamState } from '@folklore/contracts';
import type { NormalizedContainer, NormalizedFact, NormalizedRecords } from '../normalized.js';
import { emptyStreamState } from './spec-cursor.js';

export const SPEC_PAGE_CAP = 1000;
const SPEC_FETCH_CAP_PER_PULL = 2000;

export interface SpecWindow {
  readonly s: string;
  readonly e: string;
}

interface RunSnapshot {
  readonly factCount: number;
  readonly containerCount: number;
  readonly maxima: ReadonlyMap<string, string | null>;
}

export class SpecRunState {
  readonly facts: NormalizedFact[] = [];
  readonly containers: NormalizedContainer[] = [];
  stopped = false;
  private readonly states: Map<string, SpecStreamState>;
  private readonly gone = new Set<string>();
  private readonly pages = new Map<string, number>();
  private fetches = 0;

  constructor(
    initial: ReadonlyMap<string, SpecStreamState>,
    readonly window: SpecWindow,
    private readonly maxFacts: number | undefined,
  ) {
    this.states = new Map(initial);
  }

  state(name: string): SpecStreamState {
    return this.states.get(name) ?? emptyStreamState();
  }

  patch(name: string, change: Partial<SpecStreamState>): void {
    this.states.set(name, { ...this.state(name), ...change });
  }

  allStates(): ReadonlyMap<string, SpecStreamState> {
    return this.states;
  }

  append(records: NormalizedRecords): void {
    this.facts.push(...records.facts);
    this.containers.push(...records.containers);
  }

  countFetch(stream: string): void {
    this.pages.set(stream, (this.pages.get(stream) ?? 0) + 1);
    this.fetches += 1;
  }

  budgetReached(): boolean {
    const factsReached = this.maxFacts !== undefined && this.facts.length >= this.maxFacts;
    const pageCapReached = [...this.pages.values()].some((pages) => pages >= SPEC_PAGE_CAP);
    return factsReached || pageCapReached || this.fetches >= SPEC_FETCH_CAP_PER_PULL;
  }

  hasGone(name: string): boolean {
    return this.gone.has(name);
  }

  markGone(name: string): void {
    this.gone.add(name);
  }

  snapshot(names: readonly string[]): RunSnapshot {
    return {
      factCount: this.facts.length,
      containerCount: this.containers.length,
      maxima: new Map(names.map((name) => [name, this.state(name).m])),
    };
  }

  restore(snapshot: RunSnapshot): void {
    this.facts.length = snapshot.factCount;
    this.containers.length = snapshot.containerCount;
    for (const [name, m] of snapshot.maxima) this.patch(name, { m });
  }

  commit(): void {
    const diverged = [...this.states.values()].some((state) => state.d);
    for (const [name, state] of this.states) {
      this.states.set(name, {
        ...emptyStreamState(),
        c: diverged ? state.c : (state.m ?? state.c),
      });
    }
  }
}

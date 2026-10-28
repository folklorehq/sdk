// SPDX-License-Identifier: Apache-2.0
import type { ContainerLabel, StreamSpec } from '@folklore/contracts';
import { ConnectorSpecError, TransportStatusError } from '@folklore/errors';
import { resolveJsonPointer } from '@folklore/utils';
import { cursorText, isGreaterCursor } from './cursor-values.js';
import { shapeAdapterKey } from './shape-adapters.js';
import { scalarAt } from './shapes/record-values.js';
import { SpecPageFetcher, type FetchedPage, type SpecRunEnv } from './SpecPageFetcher.js';
import { SPEC_PAGE_CAP, type SpecRunState } from './SpecRunState.js';

const KEY_SEPARATOR = '\u0000';
const GONE_STATUS = 410;

interface ParentBinding {
  readonly record: unknown;
  readonly values: Readonly<Record<string, string>>;
  readonly key: string;
}

interface StartPoint {
  readonly token: string | null;
  readonly midPage: boolean;
}

interface PagePosition {
  readonly index: number;
  readonly skipEmitAt: number;
}

const FRESH: StartPoint = { token: null, midPage: false };
const START_OF_PAGE: PagePosition = { index: 0, skipEmitAt: -1 };

class RestartSignal extends Error {
  constructor(readonly stream: string) {
    super('restart');
  }
}

export class SpecStreamRun {
  private readonly children: SpecStreamRun[] = [];
  private readonly fetcher: SpecPageFetcher;

  constructor(
    private readonly stream: StreamSpec,
    private readonly env: SpecRunEnv,
    private readonly run: SpecRunState,
    private readonly parentLabel: ContainerLabel | null,
  ) {
    this.fetcher = new SpecPageFetcher(stream, env);
  }

  get name(): string {
    return this.stream.name;
  }

  addChild(child: SpecStreamRun): void {
    this.children.push(child);
  }

  isInflight(): boolean {
    const state = this.run.state(this.name);
    return state.p !== null || state.i !== null;
  }

  bind(parentRecord: unknown): ParentBinding | null {
    const values: Record<string, string> = {};
    for (const [name, pointer] of Object.entries(this.stream.parent?.bind ?? {})) {
      const value = scalarAt(parentRecord, pointer);
      if (value === undefined) return null;
      values[name] = value;
    }
    return { record: parentRecord, values, key: Object.values(values).join(KEY_SEPARATOR) };
  }

  async walk(binding: ParentBinding | null): Promise<void> {
    const start = this.startPoint(binding);
    if (start === null) return;
    const snapshot = this.run.snapshot(this.scope().map((member) => member.name));
    try {
      await this.pages(start, binding);
    } catch (error) {
      if (!(error instanceof RestartSignal) || error.stream !== this.name) throw error;
      this.run.restore(snapshot);
      this.run.markGone(this.name);
      this.resetScope(binding?.key ?? null);
      await this.pages(FRESH, binding);
    }
  }

  private startPoint(binding: ParentBinding | null): StartPoint | null {
    const state = this.run.state(this.name);
    if (binding !== null && state.k !== binding.key) {
      this.resetScope(binding.key);
      return FRESH;
    }
    if (this.isInflight()) return { token: state.p, midPage: state.i !== null };
    return binding === null ? FRESH : null;
  }

  private scope(): SpecStreamRun[] {
    return [this, ...this.children.flatMap((child) => child.scope())];
  }

  private resetScope(key: string | null): void {
    this.run.patch(this.name, { p: null, i: null, k: key });
    for (const member of this.scope().slice(1)) {
      this.run.patch(member.name, { p: null, i: null, k: null });
    }
  }

  private async pages(start: StartPoint, binding: ParentBinding | null): Promise<void> {
    let token = start.token;
    let resuming = start.midPage;
    for (let walked = 0; ; walked += 1) {
      if (walked >= SPEC_PAGE_CAP) throw new ConnectorSpecError('spec_page_cap');
      const page = await this.fetchPage(token, binding);
      this.observePage(page);
      const position = resuming ? this.resumePosition(page.records) : START_OF_PAGE;
      resuming = false;
      if (!(await this.walkRecords(page, position, token, binding))) return;
      const next = this.afterPage(page, token);
      if (next === null) return;
      token = next;
    }
  }

  private async fetchPage(
    token: string | null,
    binding: ParentBinding | null,
  ): Promise<FetchedPage> {
    this.run.countFetch(this.name);
    const cursor = this.run.hasGone(this.name) ? null : this.run.state(this.name).c;
    const restartable = cursor !== null && this.stream.cursor?.onGone === 'restart';
    try {
      return await this.fetcher.fetch({
        token,
        cursor,
        parent: binding?.values ?? {},
        window: this.run.window,
      });
    } catch (error) {
      if (restartable && isGone(error)) throw new RestartSignal(this.name);
      throw error;
    }
  }

  private observePage(page: FetchedPage): void {
    if (page.finalValue !== null) this.run.patch(this.name, { m: page.finalValue });
  }

  private afterPage(page: FetchedPage, token: string | null): string | null {
    if (page.next === null) {
      this.run.patch(this.name, { p: null, i: null });
      return null;
    }
    const next = page.next.kind === 'token' ? page.next.value : page.next.url;
    if (next === token) throw new ConnectorSpecError('spec_paginator_stalled');
    if (!this.run.budgetReached()) return next;
    this.run.patch(this.name, { p: next, i: null });
    this.run.stopped = true;
    return null;
  }

  private async walkRecords(
    page: FetchedPage,
    position: PagePosition,
    token: string | null,
    binding: ParentBinding | null,
  ): Promise<boolean> {
    for (let index = position.index; index < page.records.length; index += 1) {
      const record = page.records[index];
      this.observeRecord(record);
      if (index !== position.skipEmitAt) this.emit(record, binding?.record);
      await this.walkChildren(record);
      if (this.shouldPauseAfter(page, index)) this.run.stopped = true;
      if (this.run.stopped) {
        this.run.patch(this.name, { p: token, i: index });
        return false;
      }
    }
    return true;
  }

  private shouldPauseAfter(page: FetchedPage, index: number): boolean {
    const moreWork = index + 1 < page.records.length || page.next !== null;
    return this.children.length > 0 && !this.run.stopped && moreWork && this.run.budgetReached();
  }

  private async walkChildren(record: unknown): Promise<void> {
    for (const child of this.children) {
      const binding = child.bind(record);
      if (binding === null) continue;
      await child.walk(binding);
      if (this.run.stopped) return;
    }
  }

  private resumePosition(records: readonly unknown[]): PagePosition {
    const waiting = this.waitingChild();
    const found = waiting
      ? records.findIndex((record) => waiting.bind(record)?.key === waiting.storedKey())
      : -1;
    if (found < 0) {
      for (const child of this.children) child.resetScope(null);
      this.run.patch(this.name, { d: true });
      return START_OF_PAGE;
    }
    if (found !== this.run.state(this.name).i) this.run.patch(this.name, { d: true });
    return { index: found, skipEmitAt: found };
  }

  private waitingChild(): SpecStreamRun | null {
    const withKey = this.children.filter((child) => child.storedKey() !== null);
    return withKey.find((child) => child.isInflight()) ?? withKey[0] ?? null;
  }

  private storedKey(): string | null {
    return this.run.state(this.name).k;
  }

  private observeRecord(record: unknown): void {
    const cursor = this.stream.cursor;
    if (cursor?.source !== 'record_max') return;
    const candidate = cursorText(resolveJsonPointer(record, cursor.pointer));
    if (
      candidate !== null &&
      isGreaterCursor(candidate, this.run.state(this.name).m, cursor.format)
    ) {
      this.run.patch(this.name, { m: candidate });
    }
  }

  private emit(record: unknown, parent: unknown): void {
    const mapping = this.stream.mapping;
    if (mapping === null) return;
    const adapter = this.env.shapes[shapeAdapterKey(mapping)];
    if (!adapter) throw new ConnectorSpecError('spec_shape_missing');
    this.run.append(
      adapter.toRecords(
        record,
        mapping,
        {
          kind: this.env.kind,
          since: this.env.since,
          parentContainerLabel: this.parentLabel,
          now: this.env.now,
        },
        parent,
      ),
    );
  }
}

function isGone(error: unknown): boolean {
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    if (current instanceof TransportStatusError && current.status === GONE_STATUS) return true;
  }
  return false;
}

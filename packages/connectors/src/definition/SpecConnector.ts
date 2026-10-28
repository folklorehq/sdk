// SPDX-License-Identifier: Apache-2.0
import {
  connectorSpecSchema,
  specHostsWithin,
  type ConnectorManifest,
  type ConnectorSpec,
  type SpecStreamState,
  type StreamSpec,
} from '@folklore/contracts';
import type { ConnectorTransport } from '@folklore/core';
import { ConnectorSpecError, type AppError } from '@folklore/errors';
import { BaseConnector } from '../BaseConnector.js';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import { shapeAdapterKey, type ShapeAdapters } from './shape-adapters.js';
import { readSpecCursor, writeSpecCursor } from './spec-cursor.js';
import type { SpecRunEnv } from './SpecPageFetcher.js';
import { SpecRunState, type SpecWindow } from './SpecRunState.js';
import { SpecStreamRun } from './SpecStreamRun.js';

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

export interface SpecConnectorInput {
  readonly spec: ConnectorSpec;
  readonly manifest: ConnectorManifest;
  readonly transport: ConnectorTransport;
  readonly shapes: ShapeAdapters;
  readonly externalTenantId?: string;
  readonly now?: () => Date;
}

// UNWIRED: no kind is registered as a spec until the enclave transport supplies one.
export class SpecConnector extends BaseConnector {
  readonly kind: string;
  private readonly now: () => Date;

  constructor(
    context: ConnectorContext,
    private readonly input: SpecConnectorInput,
  ) {
    super(context);
    this.kind = input.spec.kind;
    this.now = input.now ?? (() => new Date());
    this.assertRunnable();
  }

  async listResources(): Promise<NormalizedResource[]> {
    return [];
  }

  normalizeWebhook(_event: WebhookEvent): NormalizedRecords {
    return { facts: [], containers: [] };
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const states = readSpecCursor(this.input.spec, cursor.value);
    const run = new SpecRunState(states, this.windowFor(states, options), options?.maxFacts);
    const roots = this.buildRuns(this.runEnv(options), run);
    const resumeAt = Math.max(
      0,
      roots.findIndex((root) => root.isInflight()),
    );
    for (const root of roots.slice(resumeAt)) {
      await root.walk(null);
      if (run.stopped) break;
    }
    return this.result(run);
  }

  protected override mapError(operation: string, err: unknown): AppError {
    return err instanceof ConnectorSpecError ? err : super.mapError(operation, err);
  }

  private assertRunnable(): void {
    const { spec, manifest, shapes } = this.input;
    if (spec.kind !== manifest.kind || !connectorSpecSchema.safeParse(spec).success) {
      throw new ConnectorSpecError('spec_invalid');
    }
    if (!specHostsWithin(spec, manifest)) throw new ConnectorSpecError('egress_host_refused');
    for (const stream of spec.streams) {
      if (stream.mapping !== null && !shapes[shapeAdapterKey(stream.mapping)]) {
        throw new ConnectorSpecError('spec_shape_missing');
      }
    }
  }

  private runEnv(options: PullOptions | undefined): SpecRunEnv {
    return {
      kind: this.kind,
      manifest: this.input.manifest,
      transport: this.input.transport,
      shapes: this.input.shapes,
      externalTenantId: this.input.externalTenantId ?? null,
      since: options?.since?.toISOString(),
      now: this.now,
      guard: (operation, run) => this.call(operation, run),
    };
  }

  private windowFor(
    states: ReadonlyMap<string, SpecStreamState>,
    options: PullOptions | undefined,
  ): SpecWindow {
    const first = this.input.spec.streams[0];
    const stored = first ? states.get(first.name)?.w : null;
    if (stored) return stored;
    const end = this.now();
    const start = options?.since ?? new Date(end.getTime() - TWELVE_MONTHS_MS);
    return { s: start.toISOString(), e: end.toISOString() };
  }

  private buildRuns(env: SpecRunEnv, run: SpecRunState): SpecStreamRun[] {
    const { streams } = this.input.spec;
    const byName = new Map<string, SpecStreamRun>();
    const roots: SpecStreamRun[] = [];
    for (const stream of streams) {
      const member = new SpecStreamRun(stream, env, run, this.parentLabelOf(stream));
      byName.set(stream.name, member);
      const parent = stream.parent ? byName.get(stream.parent.stream) : undefined;
      if (parent) parent.addChild(member);
      else roots.push(member);
    }
    return roots;
  }

  private parentLabelOf(stream: StreamSpec) {
    const parent = this.input.spec.streams.find(
      (candidate) => candidate.name === stream.parent?.stream,
    );
    return parent?.mapping?.shape === 'item' ? parent.mapping.containerLabel : null;
  }

  private result(run: SpecRunState): PullResult {
    const first = this.input.spec.streams[0];
    if (run.stopped && first) run.patch(first.name, { w: run.window });
    else run.commit();
    return {
      facts: run.facts,
      containers: run.containers,
      cursor: { value: writeSpecCursor(this.input.spec, run.allStates()) },
      hasMore: run.stopped,
    };
  }
}

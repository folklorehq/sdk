// SPDX-License-Identifier: Apache-2.0
import { notionPageKey } from '@folklore/utils';
import { BaseConnector } from '../BaseConnector.js';
import { notionWebhookEventSchema } from '@folklore/contracts';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '../connector.js';
import type { NormalizedFact, NormalizedRecords, NormalizedResource } from '../normalized.js';
import { takeOldestWithinBudget } from '../budgeted-pull.js';
import { isCreateEvent } from '../pull-classification.js';
import { PullStatsCounter } from '../PullStatsCounter.js';
import type { NotionApiClient, NotionPageListing } from './client.js';
import { normalizeNotionPageEvent, normalizeNotionPageSeed } from './normalize.js';
import {
  isAfterPosition,
  parseNotionCursor,
  serializeNotionCursor,
  type NotionListingState,
  type NotionPosition,
  type NotionSealedCursor,
} from './notion-cursor.js';
import type { NotionPage, NotionPageEvent } from './types.js';

export const NOTION_SETTLE_MS = 120_000;
export const NOTION_LISTING_CALLS_PER_PULL = 100;
export const NOTION_LISTING_RESTARTS = 3;

export interface NotionConnectorOptions {
  /** Pages the product created in this workspace; they are never read back as source material. */
  exportedPageIds?: ReadonlySet<string>;
  now?: () => number;
  listingCallsPerPull?: number;
}

interface PullPlan {
  position: NotionPosition | null;
  since: string | undefined;
  backfill: boolean;
  floorMs: number | null;
  budget: number;
  pullStartMs: number;
}

interface Candidate {
  page: NotionPage;
  batchIndex: number;
}

interface ListedCandidates {
  candidates: Candidate[];
  batchCursors: Array<string | null>;
  nextCursor: string | null;
  ended: boolean;
}

interface Outcome {
  taken: readonly NotionPage[];
  hasLeftover: boolean;
  position: NotionPosition | null;
  listing: NotionListingState | undefined;
}

export class NotionConnector extends BaseConnector {
  readonly kind = 'notion';
  private readonly exportedPageKeys: ReadonlySet<string>;
  private readonly now: () => number;
  private readonly listingCalls: number;

  constructor(
    context: ConnectorContext,
    private readonly client: NotionApiClient,
    options: NotionConnectorOptions = {},
  ) {
    super(context);
    this.exportedPageKeys = this.pageKeys(options.exportedPageIds ?? new Set());
    this.now = options.now ?? Date.now;
    this.listingCalls = options.listingCallsPerPull ?? NOTION_LISTING_CALLS_PER_PULL;
  }

  async listResources(): Promise<NormalizedResource[]> {
    return [];
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const stats = new PullStatsCounter();
    const state = parseNotionCursor(cursor.value);
    const plan = this.planPull(state, options);
    const outcome = await this.listAndTake(state, plan, stats);
    if (outcome === 'listing_incomplete') {
      stats.skip('listing_incomplete');
      return this.incompleteResult(cursor, stats);
    }
    if (plan.backfill) stats.markBackfill();
    const records = this.normalizeTaken(outcome.taken, plan.since, stats);
    const next: NotionSealedCursor = {
      position: outcome.position,
      ...(outcome.listing ? { listing: outcome.listing } : {}),
    };
    this.logger.debug('notion_pull_complete');
    return {
      ...records,
      cursor: { value: this.cursorValue(next, cursor.value) },
      hasMore: outcome.hasLeftover || outcome.listing !== undefined,
      stats: stats.snapshot(),
    };
  }

  private planPull(state: NotionSealedCursor, options: PullOptions | undefined): PullPlan {
    return {
      position: state.position,
      since: state.listing?.since ?? state.position?.editedAt ?? options?.since?.toISOString(),
      backfill: options?.backfill === true || state.listing?.backfill === true,
      floorMs: state.position === null ? (options?.since?.getTime() ?? null) : null,
      budget: options?.maxFacts ?? Number.POSITIVE_INFINITY,
      pullStartMs: this.now(),
    };
  }

  private async listAndTake(
    state: NotionSealedCursor,
    plan: PullPlan,
    stats: PullStatsCounter,
  ): Promise<Outcome | 'listing_incomplete'> {
    if (plan.position !== null && state.listing === undefined) {
      const descending = await this.listDescending(plan.position, stats);
      if (descending === 'incomplete') return 'listing_incomplete';
      if (descending !== 'cap_spent') return this.takeDescending(descending, plan, stats);
    }
    const listed = await this.listAscending(state.listing?.searchCursor ?? null, plan, stats);
    if (listed === 'incomplete') return 'listing_incomplete';
    return this.takeAscending(listed, plan, stats);
  }

  private async listDescending(
    position: NotionPosition,
    stats: PullStatsCounter,
  ): Promise<NotionPage[] | 'cap_spent' | 'incomplete'> {
    const floor = new Date(Date.parse(position.editedAt) - NOTION_SETTLE_MS).toISOString();
    const listing = await this.listBatch(
      {
        direction: 'descending',
        startCursor: null,
        maxCalls: this.listingCalls,
        stopBefore: floor,
      },
      stats,
    );
    if (listing.cursorRejected) return 'incomplete';
    return listing.nextCursor === null ? listing.pages : 'cap_spent';
  }

  // Assumes Notion's search cursor stays valid between pulls; a refused one restarts the listing and is counted.
  private async listAscending(
    startCursor: string | null,
    plan: PullPlan,
    stats: PullStatsCounter,
  ): Promise<ListedCandidates | 'incomplete'> {
    let cursor = startCursor;
    let batchCursors: Array<string | null> = [];
    let candidates: Candidate[] = [];
    let calls = 0;
    let restarts = 0;
    while (calls < this.listingCalls) {
      const listing = await this.listBatch(
        { direction: 'ascending', startCursor: cursor, maxCalls: 1 },
        stats,
      );
      calls += listing.calls;
      if (listing.cursorRejected) {
        stats.listingRestarted();
        restarts += 1;
        if (restarts >= NOTION_LISTING_RESTARTS) return 'incomplete';
        cursor = null;
        batchCursors = [];
        candidates = [];
        continue;
      }
      batchCursors.push(cursor);
      candidates.push(...this.candidatesOf(listing.pages, plan, batchCursors.length - 1, stats));
      cursor = listing.nextCursor;
      if (cursor === null) return { candidates, batchCursors, nextCursor: null, ended: true };
      if (this.hasEnough(candidates, plan.budget)) break;
    }
    return { candidates, batchCursors, nextCursor: cursor, ended: false };
  }

  private async listBatch(
    input: Parameters<NotionApiClient['listPages']>[0],
    stats: PullStatsCounter,
  ): Promise<NotionPageListing> {
    const listing = await this.call('listPages', () => this.client.listPages(input));
    stats.apiCall(listing.calls);
    stats.listedItem(listing.pages.length);
    return listing;
  }

  private candidatesOf(
    pages: NotionPage[],
    plan: PullPlan,
    batchIndex: number,
    stats: PullStatsCounter,
  ): Candidate[] {
    const candidates: Candidate[] = [];
    for (const page of pages) {
      if (plan.floorMs !== null && Date.parse(page.last_edited_time) < plan.floorMs) {
        stats.skip('out_of_window');
      } else if (isAfterPosition(page, plan.position)) {
        candidates.push({ page, batchIndex });
      }
    }
    return candidates;
  }

  // Ascending order means a strictly later page proves the budget-th page's timestamp is fully collected.
  private hasEnough(candidates: Candidate[], budget: number): boolean {
    if (!Number.isFinite(budget) || candidates.length <= budget) return false;
    const sorted = sortCandidates(candidates);
    const boundary = sorted[budget - 1];
    const next = sorted[budget];
    return (
      boundary !== undefined && next !== undefined && editedMs(next.page) > editedMs(boundary.page)
    );
  }

  private async takeDescending(
    pages: NotionPage[],
    plan: PullPlan,
    stats: PullStatsCounter,
  ): Promise<Outcome> {
    const candidates = pages
      .filter((page) => isAfterPosition(page, plan.position))
      .map((page) => ({ page, batchIndex: 0 }));
    const sorted = sortCandidates(candidates);
    const take = await this.takeWithinBudget(sorted, plan);
    this.countDeferred(sorted.length - take.taken.length, stats);
    return {
      taken: take.taken,
      hasLeftover: !take.exhausted,
      position: this.advancedPosition(take.taken, sorted, true, plan),
      listing: undefined,
    };
  }

  private async takeAscending(
    listed: ListedCandidates,
    plan: PullPlan,
    stats: PullStatsCounter,
  ): Promise<Outcome> {
    const sorted = sortCandidates(listed.candidates);
    const take = await this.takeWithinBudget(sorted, plan);
    const leftover = sorted.slice(take.taken.length);
    this.countDeferred(leftover.length, stats);
    const position = this.advancedPosition(take.taken, sorted, listed.ended, plan);
    return {
      taken: take.taken,
      hasLeftover: leftover.length > 0,
      position,
      listing: this.remainingListing(listed, leftover, plan),
    };
  }

  private takeWithinBudget(sorted: Candidate[], plan: PullPlan) {
    return takeOldestWithinBudget([sorted.map((candidate) => candidate.page)], {
      resumeAtMs: null,
      beforeResume: 'skip',
      budget: plan.budget,
      atMs: editedMs,
      cost: (page) => (page.archived || this.isExported(page.id) ? 0 : 1),
      tieKey: (page) => page.id,
    });
  }

  private countDeferred(count: number, stats: PullStatsCounter): void {
    for (let i = 0; i < count; i += 1) stats.skip('budget_deferred');
  }

  private remainingListing(
    listed: ListedCandidates,
    leftover: Candidate[],
    plan: PullPlan,
  ): NotionListingState | undefined {
    if (leftover.length === 0 && listed.ended) return undefined;
    const firstBatch = Math.min(...leftover.map((candidate) => candidate.batchIndex));
    const searchCursor =
      leftover.length === 0 ? listed.nextCursor : (listed.batchCursors[firstBatch] ?? null);
    return {
      mode: 'ascending',
      searchCursor,
      ...(plan.since === undefined ? {} : { since: plan.since }),
      ...(plan.backfill ? { backfill: true as const } : {}),
    };
  }

  // Never past a page edited inside the settle window, and without a page id while a later page of the same timestamp may still be unlisted.
  private advancedPosition(
    taken: readonly NotionPage[],
    all: Candidate[],
    listingEnded: boolean,
    plan: PullPlan,
  ): NotionPosition | null {
    const watermark = plan.pullStartMs - NOTION_SETTLE_MS;
    const last = taken.filter((page) => editedMs(page) < watermark).at(-1);
    if (last === undefined) return plan.position;
    const complete =
      listingEnded || all.some((candidate) => editedMs(candidate.page) > editedMs(last));
    return { editedAt: last.last_edited_time, pageId: complete ? last.id : null };
  }

  private normalizeTaken(
    taken: readonly NotionPage[],
    since: string | undefined,
    stats: PullStatsCounter,
  ): NormalizedRecords {
    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];
    for (const page of taken) {
      if (this.isExported(page.id)) {
        stats.skip('exported');
        continue;
      }
      if (page.archived) {
        stats.skip('archived');
        continue;
      }
      const type: NotionPageEvent['type'] = isCreateEvent(page.created_time, since)
        ? 'page.created'
        : 'page.updated';
      const normalized = normalizeNotionPageEvent({ type, page, workspace_id: '' });
      facts.push(...normalized.facts);
      containers.push(...normalized.containers);
    }
    stats.emittedItem(facts.length);
    return { facts, containers };
  }

  private isExported(pageId: string): boolean {
    const key = notionPageKey(pageId);
    return key !== null && this.exportedPageKeys.has(key);
  }

  // An id that is not a Notion page id is left out, so it can never match a page.
  private pageKeys(ids: ReadonlySet<string>): ReadonlySet<string> {
    const keys = new Set<string>();
    for (const id of ids) {
      const key = notionPageKey(id);
      if (key !== null) keys.add(key);
    }
    return keys;
  }

  private cursorValue(next: NotionSealedCursor, incoming: string | null): string | null {
    if (next.position === null && next.listing === undefined) return incoming;
    return serializeNotionCursor(next);
  }

  private incompleteResult(cursor: SyncCursor, stats: PullStatsCounter): PullResult {
    return {
      facts: [],
      containers: [],
      cursor: { value: cursor.value },
      hasMore: false,
      earlyReturn: true,
      stats: stats.snapshot(),
    };
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const parsed = notionWebhookEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.warn('notion_webhook_unrecognized_payload_shape');
      return { containers: [], facts: [] };
    }
    const { type, entity, data } = parsed.data;
    if (type === 'page.created') {
      const pageId =
        typeof entity?.id === 'string'
          ? entity.id
          : typeof data.page_id === 'string'
            ? data.page_id
            : typeof data.id === 'string'
              ? data.id
              : undefined;
      if (pageId === undefined) {
        this.logger.warn('notion_webhook_page_created_without_a_resolvable_page_id');
        return { containers: [], facts: [] };
      }
      return normalizeNotionPageSeed(pageId);
    }
    this.logger.warn('notion_webhook_event_skipped');
    return { containers: [], facts: [] };
  }
}

function editedMs(page: NotionPage): number {
  return Date.parse(page.last_edited_time);
}

function sortCandidates(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(
    (a, b) =>
      editedMs(a.page) - editedMs(b.page) ||
      (a.page.id < b.page.id ? -1 : a.page.id > b.page.id ? 1 : 0),
  );
}

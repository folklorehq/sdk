// SPDX-License-Identifier: Apache-2.0
import { IntercomNotificationEventSchema } from '@folklore/contracts';
import { z } from 'zod';
import { BaseConnector } from '../BaseConnector.js';
import type {
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from '../connector.js';
import type { NormalizedFact, NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { IntercomApiClient, IntercomConversationPage } from './client.js';
import { normalizeIntercomConversationParts, normalizeIntercomEvent } from './normalize.js';
import type { IntercomConversation, IntercomNotificationEvent } from './types.js';

const FACT_BUDGET_PER_PULL = 750;

const RETRY_GIVE_UP_THRESHOLD = 5;

const CURSOR_SAFETY_MARGIN_CHARS = 4096;

interface IntercomCursor {
  /** Set mid-drain (more Search/List pages remain); absent once fully caught up. */
  startingAfter?: string;
  watermark: string | null;
  /** True until a full-history drain fully catches up; carried through every continuation cursor. */
  cold?: boolean;
  /** The updatedSince epoch that minted the current drain's results — fixed for the drain's whole duration (every page) and reused as `partsFloor`; never recomputed from a fresh `options.since` mid-drain. */
  queryFloor?: number;
  /** Ids already successfully emitted from the CURRENT `startingAfter` page; present only on a fact-budget cutoff mid-page so a resume skips them instead of re-deriving a floor that could silently drop conversations. */
  pageEmittedIds?: string[];
  /** Lowest `updated_at` among conversations whose Retrieve is still unresolved; clamps the persisted watermark below it and exempts `partsFloor` (see `partsFloor`) until a fresh drain re-covers that range with zero failures, or `RETRY_GIVE_UP_THRESHOLD` is hit. */
  retryFloor?: string | null;
  /** Consecutive pulls `retryFloor` has stayed unresolved; drives the give-up threshold. */
  retryStreak?: number;
}

const IntercomCursorSchema = z.object({
  startingAfter: z.string().optional(),
  watermark: z.string().nullable().optional(),
  cold: z.boolean().optional(),
  queryFloor: z.number().optional(),
  pageEmittedIds: z.array(z.string()).optional(),
  retryFloor: z.string().nullable().optional(),
  retryStreak: z.number().optional(),
});

interface DrainResult {
  facts: NormalizedFact[];
  containers: NormalizedRecords['containers'];
  watermark: string | null;
  budgetExceeded: boolean;
  pageEmittedIds: Set<string>;
  retryFloor: number | undefined;
}

interface RetryResolution {
  watermark: string | null;
  retryFloor: string | null;
  retryStreak: number;
}

export class IntercomConnector extends BaseConnector {
  readonly kind = 'intercom';

  constructor(
    context: ConnectorContext,
    private readonly client: IntercomApiClient,
  ) {
    super(context);
  }

  async listResources(): Promise<NormalizedResource[]> {
    return [];
  }

  async pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult> {
    const state = this.decodeCursor(cursor.value);
    const isColdStart = state.cold ?? state.watermark === null;
    const isMidDrain = state.startingAfter !== undefined || state.pageEmittedIds !== undefined;
    const sinceEpoch = this.pullFloor(state, options?.since, isMidDrain);

    const page = await this.call('listConversations', () =>
      this.client.listConversations(sinceEpoch, state.startingAfter),
    );
    this.logPageIssues(page);

    const partsFloor = this.partsFloor(isColdStart, state.retryFloor, sinceEpoch);
    const drained = this.drainPage(page, state, isMidDrain, partsFloor);
    const truncated = drained.budgetExceeded || page.nextStartingAfter !== undefined;
    const retry = this.resolveRetry(state, drained, isMidDrain);

    this.logger.debug('intercom pull complete', {
      facts: drained.facts.length,
      conversations: page.conversations.length,
      truncated,
      budgetExceeded: drained.budgetExceeded,
    });

    const value = this.buildCursorValue(
      page,
      state,
      isColdStart,
      sinceEpoch,
      truncated,
      drained,
      retry,
    );
    return {
      facts: drained.facts,
      containers: drained.containers,
      cursor: { value },
      hasMore: truncated,
    };
  }

  private drainPage(
    page: IntercomConversationPage,
    state: IntercomCursor,
    isMidDrain: boolean,
    partsFloor: number | undefined,
  ): DrainResult {
    const failedIds = new Set(page.retrieveFailedConversationIds);
    const pageEmittedIds = new Set(state.pageEmittedIds ?? []);

    const facts: NormalizedFact[] = [];
    const containers: NormalizedRecords['containers'] = [];
    let watermark = state.watermark;
    let pageFailureFloor: number | undefined;
    let budgetExceeded = false;

    for (const conv of page.conversations) {
      if (pageEmittedIds.has(conv.id)) continue;
      if (facts.length >= FACT_BUDGET_PER_PULL) {
        budgetExceeded = true;
        break;
      }
      const processed = this.processConversation(conv, partsFloor, failedIds);
      facts.push(...processed.facts);
      containers.push(...processed.containers);

      if (processed.failed) {
        if (pageFailureFloor === undefined || conv.updated_at < pageFailureFloor) {
          pageFailureFloor = conv.updated_at;
        }
        continue;
      }
      pageEmittedIds.add(conv.id);
      const updatedAtStr = String(conv.updated_at);
      if (watermark === null || updatedAtStr > watermark) {
        watermark = updatedAtStr;
      }
    }

    // Mid-drain, an unresolved retry floor keeps accumulating (min-combined) across this drain's
    // pages — it must never reset just because ONE page had no new failures, since the still-failing
    // conversation may be on a later page. A fresh drain start discards the old carried value
    // instead: Search's `>` is documented inclusive, so a conversation still failing is guaranteed
    // to resurface somewhere in a drain whose floor is at/below it, making that drain's own outcome
    // (success, a fresh failure, or nothing at all) the authoritative, up-to-date signal — this is
    // also what lets a resolved retry collapse the cursor back to a bare watermark.
    const carried = isMidDrain ? this.toEpoch(state.retryFloor) : undefined;
    const retryFloor = this.minDefined(carried, pageFailureFloor);

    return {
      facts,
      containers,
      watermark,
      budgetExceeded,
      pageEmittedIds: this.boundToCurrentPage(pageEmittedIds, page),
      retryFloor,
    };
  }

  // Bounds the persisted skip-set to ids actually present on THIS fetch of the page, by
  // construction rather than by assumption — an id carried in from a prior partial attempt that
  // Search result drift no longer returns is dropped instead of accumulating forever, so the
  // cursor can never grow past one page's worth of ids (CONVERSATIONS_PAGE_SIZE) no matter how
  // many times the same page is re-fetched.
  private boundToCurrentPage(
    pageEmittedIds: Set<string>,
    page: IntercomConversationPage,
  ): Set<string> {
    const currentPageIds = new Set(page.conversations.map((conv) => conv.id));
    return new Set([...pageEmittedIds].filter((id) => currentPageIds.has(id)));
  }

  private processConversation(
    conv: IntercomConversation,
    partsFloor: number | undefined,
    failedIds: Set<string>,
  ): { facts: NormalizedFact[]; containers: NormalizedRecords['containers']; failed: boolean } {
    const event: IntercomNotificationEvent = {
      type: 'notification_event',
      topic: 'conversation.user.created',
      data: { item: conv },
      created_at: conv.created_at,
    };
    const normalized = normalizeIntercomEvent(event);
    const facts = [...normalized.facts, ...normalizeIntercomConversationParts(conv, partsFloor)];
    return { facts, containers: normalized.containers, failed: failedIds.has(conv.id) };
  }

  // KNOWN LIMITATION: Intercom's Retrieve endpoint hard-caps at the 500 most recent conversation
  // parts with no pagination past it, and the cursor never revisits a conversation once its
  // watermark clears — parts beyond the cap are gone for good, not just delayed. Kept visible via
  // this warning rather than silently dropped.
  private logPageIssues(page: IntercomConversationPage): void {
    if (page.retrieveFailedConversationIds.length > 0) {
      this.logger.warn('intercom retrieve fan-out had failures', {
        failures: page.retrieveFailedConversationIds.length,
        conversations: page.conversations.length,
      });
    }
    if (page.truncatedConversations) {
      this.logger.warn('intercom conversation exceeded the 500-part Retrieve cap', {
        truncatedConversations: page.truncatedConversations,
        conversations: page.conversations.length,
      });
    }
    if (page.partsMissingId) {
      this.logger.warn(
        'intercom dropped conversation parts with no id — cannot be safely ingested',
        {
          partsMissingId: page.partsMissingId,
          conversations: page.conversations.length,
        },
      );
    }
  }

  normalizeWebhook(event: WebhookEvent): NormalizedRecords {
    const parsed = IntercomNotificationEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      this.logger.debug('intercom webhook: unrecognized payload shape');
      return { containers: [], facts: [] };
    }
    return normalizeIntercomEvent(parsed.data);
  }

  // Mid-drain, the Search filter must stay pinned to the value that minted the drain's first page
  // (or, for a budget cutoff mid-page, that minted the current page even if `startingAfter` itself
  // is still undefined) — its pagination cursor/result order is only valid against the exact same
  // query, so the floor can't advance to the still-growing in-drain watermark until the window
  // fully drains (mirrors EmailConnector).
  private pullFloor(
    state: IntercomCursor,
    since: Date | undefined,
    isMidDrain: boolean,
  ): number | undefined {
    const sinceEpoch = since ? Math.floor(since.getTime() / 1000) : undefined;
    if (isMidDrain) return state.queryFloor ?? sinceEpoch;
    return this.resumeSince(state.watermark, sinceEpoch);
  }

  private resumeSince(
    watermark: string | null,
    sinceEpoch: number | undefined,
  ): number | undefined {
    if (!watermark) return sinceEpoch;
    const watermarkEpoch = Number(watermark);
    if (Number.isNaN(watermarkEpoch)) return sinceEpoch;
    return sinceEpoch !== undefined && sinceEpoch > watermarkEpoch ? sinceEpoch : watermarkEpoch;
  }

  // Full history only for a genuine cold-start/backfill drain. Otherwise the floor is the drain's
  // OWN stable start (`sinceEpoch`, which equals `queryFloor` on every page after the first) —
  // never the advancing watermark, which would let page 2+ of a drain silently drop parts on a
  // conversation whose updated_at fell between the drain's start and page 1's already-advanced
  // watermark. An unresolved retry (`retryFloor` set) exempts parts filtering
  // for the whole drain: the failing conversation could be on any page, and none of its parts have
  // ever been successfully emitted, so there is no watermark that could safely re-narrow them.
  // KNOWN LIMITATION: this can under-ingest a conversation that goes dormant and reactivates if its
  // older parts predate the watermark but it was never actually seen before — no per-conversation
  // "seen before" state exists to distinguish that from a normal touched-again conversation.
  private partsFloor(
    isColdStart: boolean,
    retryFloor: string | null | undefined,
    sinceEpoch: number | undefined,
  ): number | undefined {
    if (isColdStart) return undefined;
    if (retryFloor !== undefined && retryFloor !== null) return undefined;
    return sinceEpoch;
  }

  // Applies `drained.retryFloor` (see `drainPage`) as a cap on the watermark, unless
  // RETRY_GIVE_UP_THRESHOLD consecutive DRAIN RESTARTS have failed to resolve it — in which case
  // the conversation's replies are accepted as permanently lost and the watermark is let through
  // uncapped, and the streak resets. The streak counts drain restarts, not pull() calls: a
  // multi-page drain's later pages reuse the query floor fixed when the drain started, so they
  // never actually re-fetch the failing conversation — only a pull that starts a fresh drain
  // (`!isMidDrain`) queries from the capped watermark and gives it a real chance to resolve.
  private resolveRetry(
    state: IntercomCursor,
    drained: DrainResult,
    isMidDrain: boolean,
  ): RetryResolution {
    if (drained.retryFloor === undefined) {
      return { watermark: drained.watermark, retryFloor: null, retryStreak: 0 };
    }
    if (isMidDrain) {
      return {
        watermark: this.capWatermarkBelowFailures(drained.watermark, drained.retryFloor),
        retryFloor: String(drained.retryFloor),
        retryStreak: state.retryStreak ?? 0,
      };
    }
    const streak = (state.retryStreak ?? 0) + 1;
    if (streak >= RETRY_GIVE_UP_THRESHOLD) {
      this.logger.warn(
        'intercom giving up on a Retrieve failure after repeated retries — its replies are permanently lost',
        { retryFloor: drained.retryFloor, attempts: streak },
      );
      return { watermark: drained.watermark, retryFloor: null, retryStreak: 0 };
    }
    return {
      watermark: this.capWatermarkBelowFailures(drained.watermark, drained.retryFloor),
      retryFloor: String(drained.retryFloor),
      retryStreak: streak,
    };
  }

  // Never let the watermark advance past a conversation whose Retrieve is still unresolved — even
  // via a LATER conversation with a higher updated_at — or a future pull's `Search(updated_at >
  // watermark)` would never surface it again (Search's `>` behaves inclusive, so capping AT the
  // failed conversation's own updated_at, not below it, still retries it).
  private capWatermarkBelowFailures(watermark: string | null, retryFloor: number): string | null {
    const cap = String(retryFloor);
    if (watermark === null || cap < watermark) return cap;
    return watermark;
  }

  private toEpoch(value: string | null | undefined): number | undefined {
    if (value === null || value === undefined) return undefined;
    const epoch = Number(value);
    return Number.isNaN(epoch) ? undefined : epoch;
  }

  private minDefined(a: number | undefined, b: number | undefined): number | undefined {
    if (a === undefined) return b;
    if (b === undefined) return a;
    return Math.min(a, b);
  }

  // A fact-budget cutoff keeps pointing at the SAME `startingAfter` page (persisting
  // `pageEmittedIds`) instead of advancing to Intercom's own next-page cursor or re-deriving a floor
  // from the in-progress watermark — either would silently skip conversations. An unresolved
  // `retryFloor` alone can also force a JSON cursor even when nothing else is truncated, so it
  // survives collapsing to the bare-watermark form a fully-healthy pull takes.
  private buildCursorValue(
    page: IntercomConversationPage,
    state: IntercomCursor,
    isColdStart: boolean,
    sinceEpoch: number | undefined,
    truncated: boolean,
    drained: DrainResult,
    retry: RetryResolution,
  ): string | null {
    const hasPendingRetry = retry.retryFloor !== null;
    if (!truncated) {
      return hasPendingRetry
        ? this.encodeCursor({
            watermark: retry.watermark,
            cold: false,
            retryFloor: retry.retryFloor,
            retryStreak: retry.retryStreak,
          })
        : retry.watermark;
    }
    return this.encodeCursor({
      startingAfter: drained.budgetExceeded ? state.startingAfter : page.nextStartingAfter,
      watermark: retry.watermark,
      cold: isColdStart,
      queryFloor: sinceEpoch,
      pageEmittedIds: drained.budgetExceeded ? [...drained.pageEmittedIds] : undefined,
      retryFloor: hasPendingRetry ? retry.retryFloor : undefined,
      retryStreak: hasPendingRetry ? retry.retryStreak : undefined,
    });
  }

  // Fails closed to a cold restart (never throws, never lets a malformed value through) on either
  // invalid JSON or a value that parses but doesn't match IntercomCursorSchema's shape.
  private decodeCursor(value: string | null): IntercomCursor {
    if (!value) return { watermark: null };
    if (value.startsWith('{')) {
      const parsed = IntercomCursorSchema.safeParse(this.tryParseJson(value));
      if (!parsed.success) return { watermark: null };
      return {
        startingAfter: parsed.data.startingAfter,
        watermark: parsed.data.watermark ?? null,
        cold: parsed.data.cold,
        queryFloor: parsed.data.queryFloor,
        pageEmittedIds: parsed.data.pageEmittedIds,
        retryFloor: parsed.data.retryFloor,
        retryStreak: parsed.data.retryStreak,
      };
    }
    return { watermark: value };
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }

  private encodeCursor(cursor: IntercomCursor): string {
    const json = JSON.stringify(cursor);
    if (json.length <= CURSOR_SAFETY_MARGIN_CHARS) return json;
    this.logger.warn('intercom cursor exceeded its safety margin', {
      length: json.length,
    });
    const restartWatermark =
      cursor.queryFloor !== undefined ? String(cursor.queryFloor) : cursor.watermark;
    return JSON.stringify({
      watermark: restartWatermark,
      cold: cursor.cold,
      retryFloor: cursor.retryFloor,
      retryStreak: cursor.retryStreak,
    });
  }
}

// SPDX-License-Identifier: Apache-2.0
import pLimit from 'p-limit';
import { IntercomClient, type Intercom } from 'intercom-client';
import { BaseApiClient } from '../BaseApiClient.js';
import type { IntercomApiClient, IntercomConversationPage } from './client.js';
import type { IntercomAuthor, IntercomConversation, IntercomConversationPart } from './types.js';

/** Bump deliberately alongside a passing test run, never implicitly via SDK upgrade. */
const INTERCOM_API_VERSION = '2.14' as const;
/** Intercom's documented per_page ceiling. */
const CONVERSATIONS_PAGE_SIZE = 150;
/** Bounds concurrent Retrieve requests within one pull() call only — not a rate limiter, and does not hold across separate pull attempts. */
const RETRIEVE_CONCURRENCY = 10;
/** Retrieve's documented hard cap on returned parts (developers.intercom.com) — a backstop truncation signal independent of `total_count`/`statistics`, which can be absent. */
const RETRIEVE_PARTS_HARD_CAP = 500;
/** A Retrieve failure carrying one of these statuses signals a systemic problem (revoked/insufficient-scope token, or rate-limiting that outlasted the SDK's own maxRetries) that will keep failing for every conversation in the fan-out — never just this one. */
const ESCALATED_RETRIEVE_STATUSES = new Set([401, 403, 429]);

export class IntercomSdkClient extends BaseApiClient implements IntercomApiClient {
  private readonly sdk: IntercomClient;
  private readonly retrieveLimit = pLimit(RETRIEVE_CONCURRENCY);

  constructor(token: string) {
    super(token);
    this.sdk = new IntercomClient({ token: this.token, version: INTERCOM_API_VERSION });
  }

  async listConversations(
    updatedSince: number | undefined,
    startingAfter: string | undefined,
  ): Promise<IntercomConversationPage> {
    const page = await this.fetchPage(updatedSince, startingAfter);
    const summaries = page.data.map((conv) => this.toSummary(conv));
    const { conversations, failedIds, truncated, missingId } = await this.withReplies(summaries);
    return {
      conversations,
      nextStartingAfter: page.response.pages?.next?.starting_after,
      retrieveFailedConversationIds: failedIds,
      truncatedConversations: truncated,
      partsMissingId: missingId,
    };
  }

  private fetchPage(updatedSince: number | undefined, startingAfter: string | undefined) {
    if (updatedSince === undefined) {
      return this.sdk.conversations.list({
        per_page: CONVERSATIONS_PAGE_SIZE,
        starting_after: startingAfter,
      });
    }
    // Search's `>` operator is documented as inclusive ("greater or equal") for date/integer
    // fields (developers.intercom.com — see the SDK's ConversationsClient.search docstring),
    // so a conversation updated in the same second as the cursor is never skipped.
    return this.sdk.conversations.search({
      query: { field: 'updated_at', operator: '>', value: updatedSince },
      pagination: { per_page: CONVERSATIONS_PAGE_SIZE, starting_after: startingAfter },
    });
  }

  /** List/Search responses never carry conversation_parts (Intercom docs) — Retrieve is the only way to get replies. */
  private async withReplies(summaries: IntercomConversation[]): Promise<{
    conversations: IntercomConversation[];
    failedIds: string[];
    truncated: number;
    missingId: number;
  }> {
    const failedIds: string[] = [];
    let truncated = 0;
    let missingId = 0;
    const conversations = await this.retrieveLimit.map(summaries, async (summary) => {
      try {
        const full = await this.sdk.conversations.find({ conversation_id: summary.id });
        const { parts, isTruncated, droppedForMissingId } = this.toParts(full);
        if (isTruncated) truncated += 1;
        missingId += droppedForMissingId;
        return { ...summary, conversation_parts: parts };
      } catch (err) {
        this.rethrowIfEscalated(err);
        failedIds.push(summary.id);
        return summary;
      }
    });
    return { conversations, failedIds, truncated, missingId };
  }

  private rethrowIfEscalated(err: unknown): void {
    const statusCode = (err as { statusCode?: number } | null)?.statusCode;
    if (statusCode === undefined || !ESCALATED_RETRIEVE_STATUSES.has(statusCode)) return;
    throw Object.assign(new Error(`intercom conversations.find failed: ${statusCode}`), {
      status: statusCode,
    });
  }

  private toSummary(conv: Intercom.Conversation): IntercomConversation {
    return {
      type: 'conversation',
      id: conv.id ?? '',
      created_at: conv.created_at ?? 0,
      updated_at: conv.updated_at ?? 0,
      conversation_message: conv.source
        ? {
            type: 'conversation_message',
            body: conv.source.body ?? '',
            author: this.toAuthor(conv.source.author),
            created_at: conv.created_at ?? 0,
          }
        : undefined,
    };
  }

  // Retrieve is documented (SDK ConversationsClient.find docstring, developers.intercom.com) as a
  // hard cap of the 500 most recent parts with NO further pagination on this endpoint — a
  // conversation with more replies than that permanently loses the older ones once the incremental
  // cursor moves past it, since nothing ever re-visits an already-drained conversation. There is no
  // Intercom API to page through one conversation's parts beyond this cap, so real pagination isn't
  // possible here; `total_count`/`statistics.count_conversation_parts` (present even when the
  // returned array is capped) is what lets us detect the truncation instead of silently dropping it
  // — see IntercomConnector.pull for the loud warning this feeds. Absent BOTH fields, raw.length
  // hitting the documented hard cap is itself a truncation signal (fails open toward reporting it).
  private toParts(conv: Intercom.Conversation): {
    parts: IntercomConversation['conversation_parts'];
    isTruncated: boolean;
    droppedForMissingId: number;
  } {
    const raw = conv.conversation_parts?.conversation_parts ?? [];
    const reportedTotal = Math.max(
      conv.conversation_parts?.total_count ?? 0,
      conv.statistics?.count_conversation_parts ?? 0,
    );
    const isTruncated = reportedTotal > raw.length || raw.length >= RETRIEVE_PARTS_HARD_CAP;
    const withBody = raw.filter((p) => p.body);
    // A part with no id cannot be safely ingested: `sourceFactId` keys on it, and defaulting to a
    // shared placeholder ('') would collapse unrelated parts across the whole workspace onto one
    // fact row under the `unique(sourceId, sourceFactId)` constraint. Drop it, don't fake an id.
    const withId = withBody.filter((p): p is typeof p & { id: string } => Boolean(p.id));
    const droppedForMissingId = withBody.length - withId.length;
    if (withId.length === 0) return { parts: undefined, isTruncated, droppedForMissingId };
    return {
      parts: {
        conversation_parts: withId.map(
          (p): IntercomConversationPart => ({
            type: 'conversation_part',
            id: p.id,
            part_type: p.part_type ?? '',
            body: p.body ?? '',
            redacted: p.redacted,
            author: this.toAuthor(p.author),
            created_at: p.created_at ?? 0,
          }),
        ),
      },
      isTruncated,
      droppedForMissingId,
    };
  }

  private toAuthor(
    raw: { type?: string; id?: string; name?: string; email?: string } | undefined,
  ): IntercomAuthor {
    return {
      type: (raw?.type as IntercomAuthor['type']) ?? 'user',
      id: raw?.id ?? '',
      name: raw?.name,
      email: raw?.email,
    };
  }
}

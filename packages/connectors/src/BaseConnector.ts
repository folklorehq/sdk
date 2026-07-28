// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@folklore/core';
import { type AppError, ExternalServiceError, RateLimitError } from '@folklore/errors';
import type {
  Connector,
  ConnectorContext,
  PullOptions,
  PullResult,
  SyncCursor,
  WebhookEvent,
} from './connector.js';
import type { NormalizedRecords, NormalizedResource } from './normalized.js';

/** Shared connector machinery: injected logger + `call()`, which maps transport failures onto typed `@folklore/errors` so ingestion workers can apply retry/backoff uniformly. */
export abstract class BaseConnector implements Connector {
  abstract readonly kind: string;
  protected readonly logger: Logger;

  constructor(context: ConnectorContext) {
    this.logger = context.logger;
  }

  abstract listResources(): Promise<NormalizedResource[]>;
  abstract pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
  abstract normalizeWebhook(event: WebhookEvent): NormalizedRecords;

  protected async call<T>(operation: string, fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      throw this.mapError(operation, err);
    }
  }

  protected mapError(operation: string, err: unknown): AppError {
    const status = (err as { status?: number } | null)?.status;
    const options = { cause: err, component: this.kind, context: { operation } };
    if (status === 429 || status === 403) {
      return new RateLimitError(`${this.kind}: rate limited during ${operation}`, options);
    }
    return new ExternalServiceError(`${this.kind}: ${operation} failed`, options);
  }
}

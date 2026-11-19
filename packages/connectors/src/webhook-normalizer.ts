// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@folklore/core';
import type { NormalizedRecords } from './normalized.js';
import { normalizeWebhookEvent as normalizeWithRegistry } from './registry/index.js';

const noop = () => {};
const noopLogger: Logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child(): Logger {
    return noopLogger;
  },
};

export function normalizeWebhookEvent(
  source: string,
  eventType: string,
  payload: unknown,
  logger: Logger = noopLogger,
): NormalizedRecords {
  return normalizeWithRegistry(source, eventType, payload, { logger });
}

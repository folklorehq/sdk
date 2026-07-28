// SPDX-License-Identifier: Apache-2.0
import type { Logger } from '@folklore/core';

const noop = () => {};

export const noopLogger: Logger = {
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

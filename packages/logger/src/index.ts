// SPDX-License-Identifier: Apache-2.0
import type { LogContext, Logger } from '@folklore/core';
import pino, { type Logger as PinoInstance, type LoggerOptions } from 'pino';

export interface PinoLoggerOptions {
  /** Minimum level to emit. Defaults to 'info'. Use 'silent' to disable. */
  level?: string;
  /** Pretty-print via pino-pretty (for local dev). Defaults to false. */
  pretty?: boolean;
  /** Optional logger name added to every line. */
  name?: string;
  /** Initial bindings merged into every line. */
  bindings?: LogContext;
}

/** Pino-backed adapter for the `Logger` port. */
export class PinoLogger implements Logger {
  private pino: PinoInstance;

  constructor(options: PinoLoggerOptions = {}) {
    const { level = 'info', pretty = false, name, bindings } = options;
    const opts: LoggerOptions = {
      level,
      ...(name ? { name } : {}),
      ...(pretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
            },
          }
        : {}),
    };
    const instance = pino(opts);
    this.pino = bindings ? instance.child(bindings) : instance;
  }

  private static fromInstance(instance: PinoInstance): PinoLogger {
    const logger = Object.create(PinoLogger.prototype) as PinoLogger;
    logger.pino = instance;
    return logger;
  }

  trace(message: string, context?: LogContext): void {
    this.pino.trace(context ?? {}, message);
  }

  debug(message: string, context?: LogContext): void {
    this.pino.debug(context ?? {}, message);
  }

  info(message: string, context?: LogContext): void {
    this.pino.info(context ?? {}, message);
  }

  warn(message: string, context?: LogContext): void {
    this.pino.warn(context ?? {}, message);
  }

  error(message: string, context?: LogContext): void {
    this.pino.error(context ?? {}, message);
  }

  fatal(message: string, context?: LogContext): void {
    this.pino.fatal(context ?? {}, message);
  }

  child(bindings: LogContext): Logger {
    return PinoLogger.fromInstance(this.pino.child(bindings));
  }
}

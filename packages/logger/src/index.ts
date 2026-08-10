// SPDX-License-Identifier: Apache-2.0
import {
  checkSafeLogEvent,
  snapshotSafeLogContext,
  type LogContext,
  type Logger,
  type SafeLogContext,
  type SafeLogEvent,
  type SafeLogRejectionReason,
} from '@folklore/core';
import pino, {
  type DestinationStream,
  type Logger as PinoInstance,
  type LoggerOptions,
} from 'pino';

const COMPONENTS = new Set([
  'agent',
  'api',
  'control_plane_server',
  'enclave',
  'local_e2e',
  'test',
  'unknown',
  'worker',
]);

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
type BindingRejectionReason = 'invalid_child_bindings' | 'invalid_merged_bindings';
type RejectionReason = SafeLogRejectionReason | BindingRejectionReason;

export interface PinoLoggerOptions {
  /** Minimum level to emit. Defaults to 'info'. Use 'silent' to disable. */
  level?: string;
  /** Pretty-print via pino-pretty (for local dev). Defaults to false. */
  pretty?: boolean;
  /** Optional logger name added to every line. */
  name?: string;
  /** Initial bindings merged into every line. */
  bindings?: LogContext;
  /** Optional Pino destination, primarily for controlled local sinks and tests. */
  destination?: DestinationStream;
}

/** Pino-backed adapter for the `Logger` port. */
export class PinoLogger implements Logger {
  private bindings: SafeLogContext;
  private bindingRejection: BindingRejectionReason | null;
  private component: string;
  private pino: PinoInstance;

  constructor(options: PinoLoggerOptions = {}) {
    const { level = 'info', pretty = false, name, bindings = {}, destination } = options;
    const opts: LoggerOptions = {
      level,
      base: null,
      ...(pretty
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
            },
          }
        : {}),
    };
    this.pino = destination ? pino(opts, destination) : pino(opts);
    const bindingSnapshot = snapshotSafeLogContext(bindings);
    this.bindings = bindingSnapshot.context ?? {};
    this.bindingRejection = bindingSnapshot.rejection ? 'invalid_child_bindings' : null;
    this.component = componentFor(name);
  }

  private static fromParent(
    parent: PinoLogger,
    bindings: SafeLogContext,
    bindingRejection: BindingRejectionReason | null,
  ): PinoLogger {
    const logger = Object.create(PinoLogger.prototype) as PinoLogger;
    logger.pino = parent.pino;
    logger.bindings = bindings;
    logger.bindingRejection = bindingRejection;
    logger.component = parent.component;
    return logger;
  }

  trace(event: SafeLogEvent, context?: LogContext): void {
    this.log('trace', event, context);
  }

  debug(event: SafeLogEvent, context?: LogContext): void {
    this.log('debug', event, context);
  }

  info(event: SafeLogEvent, context?: LogContext): void {
    this.log('info', event, context);
  }

  warn(event: SafeLogEvent, context?: LogContext): void {
    this.log('warn', event, context);
  }

  error(event: SafeLogEvent, context?: LogContext): void {
    this.log('error', event, context);
  }

  fatal(event: SafeLogEvent, context?: LogContext): void {
    this.log('fatal', event, context);
  }

  child(bindings: LogContext): Logger {
    const bindingSnapshot = snapshotSafeLogContext(bindings);
    const childBindings = bindingSnapshot.context
      ? { ...this.bindings, ...bindingSnapshot.context }
      : this.bindings;
    const bindingRejection =
      this.bindingRejection ?? (bindingSnapshot.rejection ? 'invalid_child_bindings' : null);
    return PinoLogger.fromParent(this, childBindings, bindingRejection);
  }

  private log(level: LogLevel, event: SafeLogEvent, context: LogContext | undefined): void {
    const eventCode = typeof event === 'string' ? event : null;
    const eventRejection = checkSafeLogEvent(event);
    if (eventRejection || eventCode === null) {
      this.reject(eventRejection ?? 'invalid_event_type');
      return;
    }
    if (this.bindingRejection) {
      this.reject(this.bindingRejection);
      return;
    }
    const contextSnapshot = snapshotSafeLogContext(context ?? {});
    if (contextSnapshot.rejection) {
      this.reject(contextSnapshot.rejection);
      return;
    }
    const mergedSnapshot = snapshotSafeLogContext({
      ...this.bindings,
      ...contextSnapshot.context,
    });
    if (mergedSnapshot.rejection) {
      this.reject('invalid_merged_bindings');
      return;
    }
    this.pino[level]({ component: this.component, ...mergedSnapshot.context }, eventCode);
  }

  private reject(reasonCode: RejectionReason): void {
    this.pino.warn({ reasonCode, component: this.component }, 'log_record_rejected');
  }
}

function componentFor(name: string | undefined): string {
  const normalized = name?.replaceAll('-', '_') ?? 'unknown';
  return COMPONENTS.has(normalized) ? normalized : 'unknown';
}

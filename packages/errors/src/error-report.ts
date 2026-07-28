// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { normalizeError } from './normalize.js';

export type ErrorOrigin = 'http' | 'uncaught' | 'unhandled_rejection' | 'manual';

/** Content-free error record for fleet analytics — never message/stack text. */
export interface ErrorReport {
  error_type: string;
  error_name: string;
  category: string;
  http_status: number;
  operational: boolean;
  component: string;
  origin: ErrorOrigin;
  fingerprint: string;
  route?: string;
  source_location?: string;
}

export interface ToErrorReportOptions {
  origin: ErrorOrigin;
  component?: string;
  route?: string;
}

const FINGERPRINT_LENGTH = 16;
const NODE_INTERNAL_FRAME = /node:internal|node_modules/;
const STACK_FRAME = /\(?((?:[^\s():]+[/\\])?[^\s():/\\]+):(\d+):\d+\)?\s*$/;

export function toErrorReport(value: unknown, opts: ToErrorReportOptions): ErrorReport {
  const appError = normalizeError(
    value,
    opts.component ? { component: opts.component } : undefined,
  );
  const location = firstFrameLocation(stackOf(value) ?? appError.stack);
  const component = appError.component ?? opts.component ?? 'unknown';
  return {
    error_type: appError.code,
    error_name: appError.name,
    category: appError.category,
    http_status: appError.httpStatus,
    operational: appError.isOperational,
    component,
    origin: opts.origin,
    fingerprint: fingerprint(appError.code, component, location),
    ...(opts.route ? { route: opts.route } : {}),
    ...(location ? { source_location: location } : {}),
  };
}

function stackOf(value: unknown): string | undefined {
  return value instanceof Error ? value.stack : undefined;
}

// Only `basename:line` — never the surrounding message text a stack line can carry.
function firstFrameLocation(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  for (const line of stack.split('\n')) {
    if (!line.trimStart().startsWith('at ') || NODE_INTERNAL_FRAME.test(line)) continue;
    const match = STACK_FRAME.exec(line);
    const [, path, lineNo] = match ?? [];
    if (!path || !lineNo) continue;
    const file = path.split(/[/\\]/).pop();
    return `${file}:${lineNo}`;
  }
  return undefined;
}

function fingerprint(code: string, component: string, location: string | undefined): string {
  return createHash('sha256')
    .update(`${code}|${component}|${location ?? ''}`)
    .digest('hex')
    .slice(0, FINGERPRINT_LENGTH);
}

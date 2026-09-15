// SPDX-License-Identifier: Apache-2.0
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { checkSafeLogContext, SAFE_LOG_FIELDS, type SafeLogField } from '../src/index.js';

// The logging boundary rejects a record wholesale: one field the catalog does not permit, or one
// value its pattern refuses, and PinoLogger emits `log_record_rejected` instead of the event. The
// intended event never reaches CloudWatch, which is how a fatal-crash line and a shared-pool policy
// apply both went missing in production (91 rejected records in seven days on the control plane).
//
// Runtime validation catches this only where it happens, and only if somebody notices a missing
// event. This guard walks every logger call site in the workspace and applies the production
// validator to each statically known context, so the boundary is enforced at review time instead.

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SOURCE_ROOTS = ['apps', 'packages'];
const SAFE_FIELD_SET = new Set<string>(SAFE_LOG_FIELDS);

// This test is staged into the public product mirror, which carries `packages/` and no `apps/`, so
// every expectation is derived from the tree in front of it. A guard that asserted an absolute site
// count would fail there for being staged, and one that skipped itself would stop guarding the
// public packages exactly where they are also shipped.
const FULL_WORKSPACE = existsSync(join(REPO_ROOT, 'apps'));

// Sites that must be found wherever their file is: the scan is the guard, so a scan that silently
// stopped matching has to fail here rather than pass everything below it.
const REQUIRED_SITES: readonly (readonly [string, string])[] = [
  ['packages/telemetry/src/global-errors.ts', 'process_error_captured'],
  ['packages/connectors/src/intercom/IntercomConnector.ts', 'intercom_retrieve_failures'],
  [
    'apps/control-plane-server/src/fleet/pool/services/reconciliation/SharedPoolReconciler.ts',
    'shared_pool_reconciliation_failed',
  ],
];

// `${file}:${event}` for every context spread, each vetted by hand. A new spread fails this guard
// until it is listed here, because an opaque spread is exactly how an unpermitted key (`error_name`)
// or a value the filter refuses (`'control-plane-server'`) rides into a context unseen.
const VETTED_CONTEXT_SPREADS: Record<string, string> = {
  'packages/http/src/error-handler.ts:http_request_failed':
    'appError.toLogContext() yields error_type (an AppError code) and component (a lower-case code); the optional requestId is a canonical UUID.',
  'apps/worker/src/workers/ingest/EnclaveOutputsConsumer.ts:enclave_output_persist_failed':
    'errorCode is the literal persistence_failed and the optional messageId is a canonical UUID.',
};

// A code field (component/errorCode/error_type/outcome/operation/phase/route/status) is validated
// against a lower-case token pattern. An Error's `name` is capitalized and its `message`/`stack` are
// content-bearing, so the boundary refuses all three: `errorCode: error.name` and
// `errorCode: error.message` silently dropped the signer's entire failure record.
const CONTENT_BEARING_CODE_EXPRESSION = /\.message\b|\.stack\b|\.name\b/;

interface LoggerCallSite {
  file: string;
  line: number;
  event: string;
  context: string;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (
          entry === 'node_modules' ||
          entry === 'dist' ||
          entry === 'test' ||
          entry === 'fixtures'
        ) {
          continue;
        }
        walk(path);
        continue;
      }
      if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) files.push(path);
    }
  };
  for (const root of SOURCE_ROOTS) walk(join(REPO_ROOT, root));
  return files.sort();
}

/** Removes comments so prose that resembles a call cannot produce a phantom finding. */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
        if (source[index] === '\n') out += '\n';
        index += 1;
      }
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      out += char;
      index += 1;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\\') {
          out += source[index];
          index += 1;
        }
        out += source[index];
        index += 1;
      }
      out += quote;
      index += 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function loggerCallSites(source: string, file: string): LoggerCallSite[] {
  const sites: LoggerCallSite[] = [];
  const call =
    /(?:^|[^\w$.])([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\??\.(?:trace|debug|info|warn|error|fatal)\(\s*(['"])([A-Za-z0-9_.]+)\2\s*,\s*\{/g;
  for (const match of source.matchAll(call)) {
    // `this.deps.logger` and friends reach the same boundary as a bare `logger`.
    if (!/log/i.test((match[1] ?? '').split('.').pop() ?? '')) continue;
    const contextStart = (match.index ?? 0) + match[0].length - 1;
    let depth = 0;
    let end = contextStart;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    sites.push({
      file,
      line: source.slice(0, contextStart).split('\n').length,
      event: match[3] ?? '',
      context: source.slice(contextStart, end + 1),
    });
  }
  return sites;
}

function literalEntries(context: string): { key: string; value?: string }[] {
  const entries: { key: string; value?: string }[] = [];
  const body = context.slice(1, -1);
  const entry = /(?:^|[[{,\s])([A-Za-z_$][\w$]*)\s*:\s*([^,{}]*)/g;
  for (const match of body.matchAll(entry)) {
    const raw = (match[2] ?? '').trim();
    const text = /^'[^']*'$/.test(raw) || /^"[^"]*"$/.test(raw) ? raw.slice(1, -1) : undefined;
    entries.push({ key: match[1] ?? '', ...(text === undefined ? {} : { value: text }) });
  }
  return entries;
}

describe('logging boundary guard', () => {
  const files = sourceFiles();
  const sites = files.flatMap((path) =>
    loggerCallSites(stripComments(readFileSync(path, 'utf8')), relative(REPO_ROOT, path)),
  );

  it('finds the logger call sites it claims to check', () => {
    // Without this the whole guard passes vacuously if the scanner stops matching.
    const required = REQUIRED_SITES.filter(([file]) => existsSync(join(REPO_ROOT, file)));
    expect(required.length).toBeGreaterThan(1);
    for (const [file, event] of required) {
      expect(sites.some((site) => site.file === file && site.event === event)).toBe(true);
    }
    if (FULL_WORKSPACE) expect(sites.length).toBeGreaterThan(150);
  });

  it('uses only permitted field names as literal context keys', () => {
    const violations = sites.flatMap((site) =>
      literalEntries(site.context)
        .filter((entry) => !SAFE_FIELD_SET.has(entry.key))
        .map((entry) => `${site.file}:${site.line} ${site.event} -> ${entry.key}`),
    );
    expect(violations).toEqual([]);
  });

  it('uses only values the production validator accepts for literal context values', () => {
    const violations = sites.flatMap((site) =>
      literalEntries(site.context)
        .filter((entry) => entry.value !== undefined && SAFE_FIELD_SET.has(entry.key))
        .filter(
          (entry) =>
            checkSafeLogContext({ [entry.key]: entry.value } as Partial<
              Record<SafeLogField, string>
            >) !== null,
        )
        .map((entry) => `${site.file}:${site.line} ${site.event} -> ${entry.key}=${entry.value}`),
    );
    expect(violations).toEqual([]);
  });

  it('vets every context spread by hand', () => {
    const found = [
      ...new Set(
        sites
          .filter((site) => site.context.includes('...'))
          .map((site) => `${site.file}:${site.event}`),
      ),
    ].sort();
    const vetted = Object.entries(VETTED_CONTEXT_SPREADS)
      .filter(([site]) => existsSync(join(REPO_ROOT, site.slice(0, site.lastIndexOf(':')))))
      .map(([site]) => site)
      .sort();
    // Every spread the scan meets must be vetted, and every vetted spread whose file is present
    // must still be there, so a vetted entry cannot go stale behind a rename.
    expect(found).toEqual(vetted);
  });

  it('never derives a code field from error text', () => {
    const violations = sites.flatMap((site) => {
      const body = site.context.slice(1, -1);
      const entry =
        /(?:^|[[{,\s])(component|errorCode|error_type|outcome|operation|phase|route|status)\s*:\s*([^,{}]*)/g;
      return [...body.matchAll(entry)]
        .filter((match) => CONTENT_BEARING_CODE_EXPRESSION.test(match[2] ?? ''))
        .map((match) => `${site.file}:${site.line} ${site.event} -> ${match[1]}=${match[2] ?? ''}`);
    });
    expect(violations).toEqual([]);
  });
});

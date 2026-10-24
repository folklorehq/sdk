// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { BrowserTelemetryEvent } from '@folklore/telemetry';
import ts from 'typescript';

const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const SOURCE_ROOTS = ['apps', 'packages', 'enclave', 'ingest-proxy', 'preview-proxy'];
const COLLECT_HANDLER_PREFIX = 'apps/control-plane-server/src/analytics/collect/';
const SERVER_TRACK_MIN_ARGUMENTS = 3;
const BROWSER_EVENT_NAMES: ReadonlySet<string> = new Set(Object.values(BrowserTelemetryEvent));
const BROWSER_EVENT_CONSTANT = 'BrowserTelemetryEvent';

export interface BrowserEventRelayViolation {
  file: string;
  line: number;
}

export function auditBrowserEventRelaySource(
  file: string,
  text: string,
): BrowserEventRelayViolation[] {
  if (file.startsWith(COLLECT_HANDLER_PREFIX)) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const violations: BrowserEventRelayViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (isServerTrackOfBrowserEvent(node)) {
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      violations.push({ file, line });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export function auditBrowserEventRelayTree(root: string): BrowserEventRelayViolation[] {
  return SOURCE_ROOTS.flatMap((directory) => sourceDirectories(join(root, directory)))
    .flatMap(sourceFiles)
    .flatMap((path) => {
      const file = relative(root, path).replaceAll('\\', '/');
      return auditBrowserEventRelaySource(file, readFileSync(path, 'utf8'));
    });
}

function isServerTrackOfBrowserEvent(node: ts.Node): boolean {
  if (!ts.isCallExpression(node) || node.arguments.length < SERVER_TRACK_MIN_ARGUMENTS) {
    return false;
  }
  return isTrackCallee(node.expression) && namesBrowserEvent(node.arguments[0]);
}

function isTrackCallee(callee: ts.Expression): boolean {
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text === 'track';
  return (
    ts.isElementAccessExpression(callee) &&
    ts.isStringLiteralLike(callee.argumentExpression) &&
    callee.argumentExpression.text === 'track'
  );
}

function namesBrowserEvent(argument: ts.Expression | undefined): boolean {
  if (argument === undefined) return false;
  if (ts.isStringLiteralLike(argument)) return BROWSER_EVENT_NAMES.has(argument.text);
  return (
    ts.isPropertyAccessExpression(argument) &&
    ts.isIdentifier(argument.expression) &&
    argument.expression.text === BROWSER_EVENT_CONSTANT
  );
}

function sourceDirectories(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const own = join(directory, 'src');
  const nested = readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const sourceRoot = join(directory, entry.name, 'src');
    return entry.isDirectory() && existsSync(sourceRoot) ? [sourceRoot] : [];
  });
  return existsSync(own) ? [own, ...nested] : nested;
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name) && !entry.name.endsWith('.d.ts')
      ? [path]
      : [];
  });
}

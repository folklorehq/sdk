// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const BROWSER_SOURCE_ROOTS = ['apps', 'packages'];
const FACADE_SOURCE_PREFIX = 'packages/web-telemetry/';
const GLOBAL_SDK_HOSTS = new Set(['globalThis', 'window', 'self']);

export interface BrowserTelemetryViolation {
  file: string;
  line: number;
  reason: 'direct_sdk_import' | 'direct_sdk_capture';
}

export function auditBrowserTelemetrySource(
  file: string,
  text: string,
): BrowserTelemetryViolation[] {
  if (file.startsWith(FACADE_SOURCE_PREFIX)) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = postHogImports(source);
  const capturedImports = new Set<ts.Node>();
  const violations: BrowserTelemetryViolation[] = [];

  const visit = (node: ts.Node): void => {
    const binding = postHogCaptureBinding(node, imports, source);
    if (binding) {
      if (binding.node) capturedImports.add(binding.node);
      violations.push(violation(source, file, node, 'direct_sdk_capture'));
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  for (const importNode of imports.nodes) {
    if (!capturedImports.has(importNode)) {
      violations.push(violation(source, file, importNode, 'direct_sdk_import'));
    }
  }
  return violations;
}

export function auditBrowserTelemetryTree(root: string): BrowserTelemetryViolation[] {
  return BROWSER_SOURCE_ROOTS.flatMap((directory) => sourceDirectories(join(root, directory)))
    .flatMap(sourceFiles)
    .flatMap((path) => {
      const file = normalizePath(relative(root, path));
      return auditBrowserTelemetrySource(file, readFileSync(path, 'utf8'));
    });
}

interface PostHogImports {
  bindings: Map<string, ts.Node | null>;
  captureMethods: Set<string>;
  nodes: ts.Node[];
}

function postHogImports(source: ts.SourceFile): PostHogImports {
  const bindings = new Map<string, ts.Node | null>();
  const captureMethods = new Set<string>();
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isPostHogModuleSpecifier(node.moduleSpecifier)) {
      nodes.push(node);
      const clause = node.importClause;
      if (clause?.name) bindings.set(clause.name.text, node);
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) bindings.set(named.name.text, node);
      if (named && ts.isNamedImports(named)) {
        for (const specifier of named.elements) bindings.set(specifier.name.text, node);
      }
    } else if (ts.isExportDeclaration(node) && isPostHogModuleSpecifier(node.moduleSpecifier)) {
      nodes.push(node);
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const specifier of node.exportClause.elements) {
          bindings.set(specifier.name.text, node);
        }
      }
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      isPostHogModuleSpecifier(node.moduleReference.expression)
    ) {
      nodes.push(node);
      bindings.set(node.name.text, node);
    } else if (isPostHogDynamicImport(node)) {
      nodes.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  let previousSize = -1;
  while (previousSize !== aliasStateSize(bindings, captureMethods)) {
    previousSize = aliasStateSize(bindings, captureMethods);
    const visitAlias = (node: ts.Node): void => {
      collectAlias(node, source, bindings, captureMethods);
      ts.forEachChild(node, visitAlias);
    };
    visitAlias(source);
  }
  return { bindings, captureMethods, nodes };
}

function aliasStateSize(
  bindings: Map<string, ts.Node | null>,
  captureMethods: Set<string>,
): number {
  return bindings.size + captureMethods.size;
}

function collectAlias(
  node: ts.Node,
  source: ts.SourceFile,
  bindings: Map<string, ts.Node | null>,
  captureMethods: Set<string>,
): void {
  if (!ts.isVariableDeclaration(node) || !node.initializer) return;
  const initializer = unwrapExpression(node.initializer);
  if (ts.isIdentifier(node.name)) {
    const name = node.name.text;
    if (bindings.has(name) || captureMethods.has(name)) return;
    if (isSdkRequire(initializer) || isGlobalSdkReference(initializer)) {
      bindings.set(name, null);
    } else if (ts.isIdentifier(initializer)) {
      if (bindings.has(initializer.text)) bindings.set(name, null);
      else if (captureMethods.has(initializer.text)) captureMethods.add(name);
    }
    return;
  }
  if (!ts.isObjectBindingPattern(node.name)) return;
  for (const element of node.name.elements) {
    if (!ts.isIdentifier(element.name)) continue;
    const property = element.propertyName ? propertyName(element.propertyName) : element.name.text;
    if (!property) continue;
    if (isSdkRequire(initializer) || isSdkBinding(initializer, bindings)) {
      if (property === 'capture') captureMethods.add(element.name.text);
    } else if (isGlobalObject(initializer) && property === 'posthog') {
      bindings.set(element.name.text, null);
    }
  }
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function isSdkRequire(expression: ts.Expression): boolean {
  return (
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'require' &&
    isPostHogModuleSpecifier(expression.arguments[0])
  );
}

function isGlobalSdkReference(expression: ts.Expression): boolean {
  const value = unwrapExpression(expression);
  if (!ts.isPropertyAccessExpression(value) || value.name.text !== 'posthog') return false;
  return ts.isIdentifier(value.expression) && GLOBAL_SDK_HOSTS.has(value.expression.text);
}

function isGlobalObject(expression: ts.Expression): boolean {
  const value = unwrapExpression(expression);
  return ts.isIdentifier(value) && GLOBAL_SDK_HOSTS.has(value.text);
}

function isSdkBinding(expression: ts.Expression, bindings: Map<string, ts.Node | null>): boolean {
  const value = unwrapExpression(expression);
  return ts.isIdentifier(value) && bindings.has(value.text);
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function isPostHogDynamicImport(node: ts.Node): boolean {
  if (!ts.isCallExpression(node) || node.expression.kind !== ts.SyntaxKind.ImportKeyword) {
    return false;
  }
  const [specifier] = node.arguments;
  return isPostHogModuleSpecifier(specifier);
}

function isPostHogModuleSpecifier(
  node: ts.Node | undefined,
): node is ts.StringLiteral | ts.NoSubstitutionTemplateLiteral {
  return (
    node !== undefined &&
    (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    (node.text === 'posthog-js' || node.text.startsWith('posthog-js/'))
  );
}

function postHogCaptureBinding(
  node: ts.Node,
  imports: PostHogImports,
  source: ts.SourceFile,
): { node: ts.Node | null } | null {
  if (!ts.isCallExpression(node)) return null;
  const expression = node.expression;
  if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'capture') {
    const receiver = expression.expression;
    const receiverText = receiver.getText(source);
    const binding = imports.bindings.get(receiverText);
    if (binding !== undefined) return { node: binding };
    if (isGlobalSdkReference(receiver)) return { node: null };
  }
  if (ts.isIdentifier(expression) && imports.captureMethods.has(expression.text)) {
    return { node: null };
  }
  return null;
}

function violation(
  source: ts.SourceFile,
  file: string,
  node: ts.Node,
  reason: BrowserTelemetryViolation['reason'],
): BrowserTelemetryViolation {
  return {
    file,
    line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    reason,
  };
}

function sourceDirectories(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const sourceRoot = join(directory, entry.name, 'src');
    return existsSync(sourceRoot) ? [sourceRoot] : [];
  });
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

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}

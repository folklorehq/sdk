// SPDX-License-Identifier: Apache-2.0
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { checkSafeLogContext, checkSafeLogEvent } from '@folklore/core';
import ts from 'typescript';

const LOG_LEVELS = new Set(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);
const LOGGER_METHODS = new Set([...LOG_LEVELS, 'child']);
const CONSOLE_METHODS = new Set(['trace', 'debug', 'info', 'log', 'warn', 'error']);
const SOURCE_FILE_PATTERN = /\.[cm]?[jt]sx?$/;
const PRODUCTION_ROOTS = ['apps', 'packages'];
const DYNAMIC_VALUE = Symbol('dynamic_log_value');
const CONSOLE_EXEMPT_FILES = new Set([
  'apps/api/src/main.ts',
  'apps/control-plane-server/src/ops/cli.ts',
  'apps/control-plane-server/src/ops/setup-stripe-products.ts',
  'apps/worker/src/dev-bridge.ts',
  'apps/worker/src/dev-resolve-themes.ts',
  'packages/cli/src/commands/verify-attestation.ts',
  'packages/cli/src/main.ts',
]);

export interface StaticLogViolation {
  file: string;
  line: number;
  reason: string;
}

interface LoggerAliases {
  consoleMethods: Set<string>;
  consoleReceivers: Set<string>;
  methods: Map<string, string>;
  pinoFactories: Set<string>;
  pinoNamespaces: Set<string>;
  rawPinoMethods: Set<string>;
  rawPinoReceivers: Set<string>;
  receivers: Set<string>;
}

interface LoggerMethod {
  name: string;
  rejectsDynamicContext: boolean;
}

export function auditLogSource(file: string, text: string): StaticLogViolation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const aliases = collectLoggerAliases(source);
  const violations: StaticLogViolation[] = [];
  const visit = (node: ts.Node): void => {
    if (isConsoleCall(node, source, aliases) && !CONSOLE_EXEMPT_FILES.has(file)) {
      violations.push(violation(source, file, node, 'console bypass'));
    }
    if (ts.isCallExpression(node)) {
      const method = loggerMethod(node, source, aliases);
      if (method) validateLoggerCall(node, method, source, file, violations);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return violations;
}

export function auditProductionLogs(root: string): StaticLogViolation[] {
  return productionSourceFiles(root).flatMap((path) => {
    const file = normalizePath(relative(root, path));
    return auditLogSource(file, readFileSync(path, 'utf8'));
  });
}

function productionSourceFiles(root: string): string[] {
  return PRODUCTION_ROOTS.flatMap((directory) => sourceDirectories(join(root, directory))).flatMap(
    sourceFiles,
  );
}

function sourceDirectories(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const path = join(directory, entry.name);
    const sourceRoot = join(path, 'src');
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

function collectLoggerAliases(source: ts.SourceFile): LoggerAliases {
  const aliases: LoggerAliases = {
    consoleMethods: new Set(),
    consoleReceivers: new Set(),
    methods: new Map(),
    pinoFactories: new Set(),
    pinoNamespaces: new Set(),
    rawPinoMethods: new Set(),
    rawPinoReceivers: new Set(),
    receivers: new Set(),
  };
  let previousSize = -1;
  while (previousSize !== aliasCount(aliases)) {
    previousSize = aliasCount(aliases);
    const visit = (node: ts.Node): void => {
      collectAlias(node, source, aliases);
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return aliases;
}

function aliasCount(aliases: LoggerAliases): number {
  return (
    aliases.consoleMethods.size +
    aliases.consoleReceivers.size +
    aliases.methods.size +
    aliases.pinoFactories.size +
    aliases.pinoNamespaces.size +
    aliases.rawPinoMethods.size +
    aliases.rawPinoReceivers.size +
    aliases.receivers.size
  );
}

function collectAlias(node: ts.Node, source: ts.SourceFile, aliases: LoggerAliases): void {
  if (ts.isImportDeclaration(node)) {
    collectPinoImport(node, aliases);
  } else if (ts.isVariableDeclaration(node) && node.initializer) {
    bindAlias(node.name, node.initializer, node.type, source, aliases);
  } else if (ts.isParameter(node) && ts.isIdentifier(node.name) && isLoggerType(node.type)) {
    aliases.receivers.add(node.name.text);
  } else if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    isAliasTarget(node.left)
  ) {
    bindExpressionAlias(node.left, node.right, source, aliases);
  }
}

function collectPinoImport(node: ts.ImportDeclaration, aliases: LoggerAliases): void {
  if (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'pino') return;
  const clause = node.importClause;
  if (clause?.name) aliases.pinoFactories.add(clause.name.text);
  const named = clause?.namedBindings;
  if (named && ts.isNamespaceImport(named)) {
    aliases.pinoNamespaces.add(named.name.text);
    return;
  }
  if (!named || !ts.isNamedImports(named)) return;
  for (const specifier of named.elements) {
    const imported = specifier.propertyName?.text ?? specifier.name.text;
    if (imported === 'default' || imported === 'pino') {
      aliases.pinoFactories.add(specifier.name.text);
    }
  }
}

function bindAlias(
  name: ts.BindingName,
  initializer: ts.Expression,
  type: ts.TypeNode | undefined,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): void {
  if (ts.isIdentifier(name)) {
    if (isLoggerType(type)) aliases.receivers.add(name.text);
    if (isConsoleReceiver(initializer, source, aliases)) aliases.consoleReceivers.add(name.text);
    if (isConsoleSinkReference(initializer, source, aliases)) aliases.consoleMethods.add(name.text);
    bindExpressionAlias(name, initializer, source, aliases);
    return;
  }
  if (!ts.isObjectBindingPattern(name)) return;
  for (const element of name.elements) {
    if (!ts.isIdentifier(element.name)) continue;
    const property = element.propertyName ? propertyName(element.propertyName) : element.name.text;
    if (!property) continue;
    if (isConsoleReceiver(initializer, source, aliases) && CONSOLE_METHODS.has(property)) {
      aliases.consoleMethods.add(element.name.text);
    } else if (isLoggerReceiver(initializer, source, aliases) && LOGGER_METHODS.has(property)) {
      aliases.methods.set(element.name.text, property);
    } else if (property.toLowerCase().endsWith('logger')) {
      aliases.receivers.add(element.name.text);
    }
  }
}

function bindExpressionAlias(
  target: ts.Expression,
  initializer: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): void {
  const targetKey = target.getText(source);
  if (isConsoleReceiver(initializer, source, aliases)) aliases.consoleReceivers.add(targetKey);
  if (isConsoleSinkReference(initializer, source, aliases)) {
    aliases.consoleMethods.add(targetKey);
  }
  if (isPinoFactoryReference(initializer, source, aliases)) aliases.pinoFactories.add(targetKey);
  if (isRawPinoReceiver(initializer, source, aliases)) aliases.rawPinoReceivers.add(targetKey);
  if (isLoggerReceiver(initializer, source, aliases)) aliases.receivers.add(targetKey);
  const method = referencedLoggerMethod(initializer, source, aliases);
  if (method) aliases.methods.set(targetKey, method);
  if (isRawPinoMethod(initializer, source, aliases)) aliases.rawPinoMethods.add(targetKey);
}

function loggerMethod(
  node: ts.CallExpression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): LoggerMethod | null {
  if (ts.isIdentifier(node.expression)) {
    const name = aliases.methods.get(node.expression.text);
    return name
      ? { name, rejectsDynamicContext: aliases.rawPinoMethods.has(node.expression.text) }
      : null;
  }
  const member = memberAccess(node.expression);
  if (!member) return null;
  return LOGGER_METHODS.has(member.name) && isLoggerReceiver(member.receiver, source, aliases)
    ? {
        name: member.name,
        rejectsDynamicContext: isRawPinoReceiver(member.receiver, source, aliases),
      }
    : null;
}

function referencedLoggerMethod(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): string | null {
  const value = unwrapExpression(expression);
  const member = ts.isCallExpression(value) ? memberAccess(value.expression) : memberAccess(value);
  if (!member) return null;
  if (member.name === 'bind') return referencedLoggerMethod(member.receiver, source, aliases);
  return LOGGER_METHODS.has(member.name) && isLoggerReceiver(member.receiver, source, aliases)
    ? member.name
    : null;
}

function isLoggerReceiver(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  const value = unwrapExpression(expression);
  const key = value.getText(source);
  if (aliases.receivers.has(key)) return true;
  if (ts.isIdentifier(value)) return value.text.toLowerCase().endsWith('logger');
  if (isLoggerFactory(value, source, aliases)) return true;
  if (ts.isPropertyAccessExpression(value)) {
    return value.name.text.toLowerCase().endsWith('logger');
  }
  return (
    ts.isCallExpression(value) &&
    ts.isPropertyAccessExpression(value.expression) &&
    value.expression.name.text === 'child' &&
    isLoggerReceiver(value.expression.expression, source, aliases)
  );
}

function isRawPinoReceiver(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  const value = unwrapExpression(expression);
  if (aliases.rawPinoReceivers.has(value.getText(source))) return true;
  if (isPinoFactory(value, source, aliases)) return true;
  const member = ts.isCallExpression(value) ? memberAccess(value.expression) : memberAccess(value);
  return (
    ts.isCallExpression(value) &&
    member?.name === 'child' &&
    isRawPinoReceiver(member.receiver, source, aliases)
  );
}

function isRawPinoMethod(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  const value = unwrapExpression(expression);
  const member = ts.isCallExpression(value) ? memberAccess(value.expression) : memberAccess(value);
  if (!member) return false;
  if (member.name === 'bind') return isRawPinoMethod(member.receiver, source, aliases);
  return LOG_LEVELS.has(member.name) && isRawPinoReceiver(member.receiver, source, aliases);
}

function isLoggerFactory(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  if (ts.isNewExpression(expression)) {
    return expression.expression.getText().toLowerCase().endsWith('logger');
  }
  return isPinoFactory(expression, source, aliases);
}

function isPinoFactory(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  return (
    ts.isCallExpression(expression) &&
    isPinoFactoryReference(expression.expression, source, aliases)
  );
}

function isPinoFactoryReference(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  const value = unwrapExpression(expression);
  if (ts.isIdentifier(value)) return value.text === 'pino' || aliases.pinoFactories.has(value.text);
  if (ts.isCallExpression(value)) {
    const bound = memberAccess(value.expression);
    return bound?.name === 'bind' && isPinoFactoryReference(bound.receiver, source, aliases);
  }
  const member = memberAccess(value);
  return (
    member !== null &&
    (member.name === 'default' || member.name === 'pino') &&
    aliases.pinoNamespaces.has(member.receiver.getText(source))
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression)
  ) {
    return unwrapExpression(expression.expression);
  }
  return expression;
}

function isLoggerType(type: ts.TypeNode | undefined): boolean {
  if (!type) return false;
  if (ts.isUnionTypeNode(type)) return type.types.some(isLoggerType);
  if (!ts.isTypeReferenceNode(type)) return false;
  const name = type.typeName.getText().toLowerCase();
  return name === 'logger' || name.endsWith('loggerport');
}

function validateLoggerCall(
  call: ts.CallExpression,
  method: LoggerMethod,
  source: ts.SourceFile,
  file: string,
  violations: StaticLogViolation[],
): void {
  if (method.name === 'child') {
    validateChildCall(call, method.rejectsDynamicContext, source, file, violations);
    return;
  }
  const [event, context, ...rest] = call.arguments;
  if (!event || !ts.isStringLiteral(event) || checkSafeLogEvent(event.text) !== null) {
    violations.push(violation(source, file, call, 'invalid event'));
  }
  if (rest.length > 0) violations.push(violation(source, file, call, 'extra log arguments'));
  if (context) validateContext(context, method.rejectsDynamicContext, source, file, violations);
}

function validateChildCall(
  call: ts.CallExpression,
  rejectsDynamicContext: boolean,
  source: ts.SourceFile,
  file: string,
  violations: StaticLogViolation[],
): void {
  const [context, ...rest] = call.arguments;
  if (!context) violations.push(violation(source, file, call, 'missing child context'));
  else validateContext(context, rejectsDynamicContext, source, file, violations);
  if (rest.length > 0) violations.push(violation(source, file, call, 'extra child arguments'));
}

function validateContext(
  context: ts.Expression,
  rejectsDynamicContext: boolean,
  source: ts.SourceFile,
  file: string,
  violations: StaticLogViolation[],
): void {
  if (!ts.isObjectLiteralExpression(context)) {
    violations.push(violation(source, file, context, 'dynamic context'));
    return;
  }
  const staticContext: Record<string, unknown> = {};
  for (const property of context.properties) {
    if (ts.isSpreadAssignment(property)) {
      if (!isSafeContextSpread(property.expression, source, rejectsDynamicContext)) {
        violations.push(violation(source, file, property, 'dynamic context key'));
      }
      continue;
    }
    const entry = staticContextEntry(property);
    if (!entry) {
      violations.push(violation(source, file, property, 'dynamic context key'));
      continue;
    }
    if (entry[1] === DYNAMIC_VALUE) {
      if (rejectsDynamicContext) {
        violations.push(violation(source, file, property, 'invalid_context_value'));
      }
      continue;
    }
    staticContext[entry[0]] = entry[1];
  }
  const rejection = checkSafeLogContext(staticContext);
  if (rejection) violations.push(violation(source, file, context, rejection));
}

function isSafeContextSpread(
  expression: ts.Expression,
  source: ts.SourceFile,
  rejectsDynamicContext: boolean,
): boolean {
  const value = unwrapExpression(expression);
  if (ts.isConditionalExpression(value)) {
    return (
      isSafeContextSpread(value.whenTrue, source, rejectsDynamicContext) &&
      isSafeContextSpread(value.whenFalse, source, rejectsDynamicContext)
    );
  }
  if (ts.isObjectLiteralExpression(value)) {
    if (!rejectsDynamicContext) return contextKeysAreStatic(value);
    const context = Object.fromEntries(
      value.properties.map(staticContextEntry).filter((entry) => entry !== null),
    );
    return context && contextKeysAreStatic(value) && checkSafeLogContext(context) === null;
  }
  if (
    !rejectsDynamicContext &&
    ts.isCallExpression(value) &&
    ts.isPropertyAccessExpression(value.expression) &&
    value.expression.name.text === 'toLogContext'
  ) {
    return true;
  }
  return (
    !rejectsDynamicContext && ts.isIdentifier(value) && isErrorReportIdentifier(value.text, source)
  );
}

function contextKeysAreStatic(context: ts.ObjectLiteralExpression): boolean {
  return context.properties.every((property) => staticContextEntry(property) !== null);
}

function isErrorReportIdentifier(name: string, source: ts.SourceFile): boolean {
  let isErrorReport = false;
  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'toErrorReport'
    ) {
      isErrorReport = true;
    }
    if (!isErrorReport) ts.forEachChild(node, visit);
  };
  visit(source);
  return isErrorReport;
}

function staticContextEntry(
  property: ts.ObjectLiteralElementLike,
): [string, unknown | typeof DYNAMIC_VALUE] | null {
  if (ts.isShorthandPropertyAssignment(property)) return [property.name.text, DYNAMIC_VALUE];
  if (!ts.isPropertyAssignment(property)) return null;
  const name = propertyName(property.name);
  if (!name) return null;
  return [name, staticValue(property.initializer)];
}

function propertyName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
    return name.text;
  }
  return null;
}

function staticValue(expression: ts.Expression): unknown | typeof DYNAMIC_VALUE {
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
    return expression.text;
  }
  if (ts.isNumericLiteral(expression)) return Number(expression.text);
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (expression.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(expression) && ts.isNumericLiteral(expression.operand)) {
    const value = Number(expression.operand.text);
    if (expression.operator === ts.SyntaxKind.MinusToken) return -value;
    if (expression.operator === ts.SyntaxKind.PlusToken) return value;
  }
  return DYNAMIC_VALUE;
}

function isConsoleCall(
  node: ts.Node,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  if (ts.isIdentifier(node.expression)) return aliases.consoleMethods.has(node.expression.text);
  const member = memberAccess(node.expression);
  if (!member) return false;
  return (
    (CONSOLE_METHODS.has(member.name) && isConsoleReceiver(member.receiver, source, aliases)) ||
    (member.name === 'write' && isProcessStderr(member.receiver))
  );
}

function isConsoleReceiver(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  const value = unwrapExpression(expression);
  if (aliases.consoleReceivers.has(value.getText(source))) return true;
  if (ts.isIdentifier(value)) return value.text === 'console';
  const member = memberAccess(value);
  return (
    member !== null &&
    member.name === 'console' &&
    ts.isIdentifier(member.receiver) &&
    (member.receiver.text === 'globalThis' || member.receiver.text === 'global')
  );
}

function isConsoleSinkReference(
  expression: ts.Expression,
  source: ts.SourceFile,
  aliases: LoggerAliases,
): boolean {
  const value = unwrapExpression(expression);
  const direct = memberAccess(value);
  if (direct) {
    return (
      (CONSOLE_METHODS.has(direct.name) && isConsoleReceiver(direct.receiver, source, aliases)) ||
      (direct.name === 'write' && isProcessStderr(direct.receiver))
    );
  }
  if (!ts.isCallExpression(value)) return false;
  const bound = memberAccess(value.expression);
  return bound?.name === 'bind' && isConsoleSinkReference(bound.receiver, source, aliases);
}

function isProcessStderr(expression: ts.Expression): boolean {
  const member = memberAccess(unwrapExpression(expression));
  return (
    member?.name === 'stderr' &&
    ts.isIdentifier(member.receiver) &&
    member.receiver.text === 'process'
  );
}

function memberAccess(expression: ts.Expression): { receiver: ts.Expression; name: string } | null {
  if (ts.isPropertyAccessExpression(expression)) {
    return { receiver: expression.expression, name: expression.name.text };
  }
  if (!ts.isElementAccessExpression(expression)) return null;
  const argument = expression.argumentExpression;
  if (
    !argument ||
    (!ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument))
  ) {
    return null;
  }
  return { receiver: expression.expression, name: argument.text };
}

function isAliasTarget(node: ts.Node): node is ts.Identifier | ts.PropertyAccessExpression {
  return ts.isIdentifier(node) || ts.isPropertyAccessExpression(node);
}

function violation(
  source: ts.SourceFile,
  file: string,
  node: ts.Node,
  reason: string,
): StaticLogViolation {
  return {
    file,
    line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
    reason,
  };
}

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/');
}

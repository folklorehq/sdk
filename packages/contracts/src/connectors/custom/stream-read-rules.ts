// SPDX-License-Identifier: Apache-2.0
import { SPEC_TEMPLATE_TOKEN, type ConnectorSpec } from '../stream-spec.js';
import {
  PAGING_VERB_EXEMPT_NAMES,
  hasWriteVerb,
  hasWriteVerbInParam,
  isFramingHeader,
  isMethodOverrideHeader,
  isMethodOverrideParam,
} from './read-semantics.js';

type SpecStream = ConnectorSpec['streams'][number];

// Template tokens are filled from record values or the runtime, so they never name an action.
export const withoutTemplateTokens = (value: string): string =>
  value.replace(SPEC_TEMPLATE_TOKEN, ' ');

export function pagingNames({ paginator, cursor }: SpecStream): string[] {
  return [
    ...('param' in paginator ? [paginator.param] : []),
    ...('limitParam' in paginator ? [paginator.limitParam] : []),
    ...(cursor ? [cursor.param, ...cursor.dropsParams] : []),
  ];
}

// The main paging and cursor parameters may use the exempt names; the limit and dropped names get the full check.
function verbCheckedPagingNames({ paginator, cursor }: SpecStream): string[] {
  const main = [
    ...('param' in paginator ? [paginator.param] : []),
    ...(cursor ? [cursor.param] : []),
  ];
  const others = [
    ...('limitParam' in paginator ? [paginator.limitParam] : []),
    ...(cursor?.dropsParams ?? []),
  ];
  return [...main.filter((name) => !PAGING_VERB_EXEMPT_NAMES.has(name)), ...others];
}

export function requestHasWriteVerb(stream: SpecStream): boolean {
  const { path, query = {}, body = {}, headers = {} } = stream.request;
  const named = [...Object.entries(query), ...Object.entries(body), ...Object.entries(headers)];
  return (
    named.some(([name, value]) => hasWriteVerbInParam(name, value)) ||
    verbCheckedPagingNames(stream).some((name) => hasWriteVerbInParam(name, '')) ||
    [path, ...named.map(([, value]) => value)].some((value) =>
      hasWriteVerb(withoutTemplateTokens(value)),
    )
  );
}

export function overridesMethod(stream: SpecStream): boolean {
  const { query = {}, body = {}, headers = {} } = stream.request;
  const names = [...Object.keys(query), ...Object.keys(body), ...pagingNames(stream)];
  return Object.keys(headers).some(isMethodOverrideHeader) || names.some(isMethodOverrideParam);
}

export const hasFramingHeader = (stream: SpecStream): boolean =>
  Object.keys(stream.request.headers ?? {}).some(isFramingHeader);

// A percent-encoded path hides a verb from the word check that the provider decodes.
export const hasEncodedPath = (stream: SpecStream): boolean => stream.request.path.includes('%');

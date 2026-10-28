// SPDX-License-Identifier: Apache-2.0
import { canonicalJson } from '@folklore/utils/canonical-json-pure';
import { resolveJsonPointer } from '@folklore/utils/json-pointer';
import type { CustomDefinition } from './custom-definition.js';
import { PAGING_PARAM_NAMES } from './read-semantics.js';

export type CustomRevisionClass = 'narrower' | 'equivalent' | 'wider';

export interface RevisionEvidence {
  // Records the repair dry run read, by stream index; a changed pointer is judged on these alone.
  readonly freshSamples: ReadonlyMap<number, readonly unknown[]>;
  // Whole responses the dry run received, by stream index; a changed record selector is judged on these.
  readonly freshResponses: ReadonlyMap<number, readonly unknown[]>;
}

export class CustomRevisionError extends Error {
  readonly code = 'custom_revision_identity_changed';

  constructor() {
    super('custom_revision_identity_changed');
    this.name = 'CustomRevisionError';
  }
}

export type EquivalenceEvidence = 'sample_values' | 'selector_overlap' | 'paging';

export interface EquivalentPath {
  readonly pattern: string;
  readonly evidence: EquivalenceEvidence;
}

const SAMPLE_VALUE_FIELDS = [
  'titlePointer',
  'bodyPointer',
  'authorIdPointer',
  'createdAtPointer',
  'updatedAtPointer',
  'status/pointer',
] as const;
// The paginator type and the followed-URL pointers are left out: they change where a request goes.
const PAGINATOR_FIELDS = [
  'param',
  'in',
  'start',
  'lastPagePointer',
  'nextPointer',
  'limitParam',
  'limit',
] as const;
const MAPPED_ROOTS = ['/source/spec/streams/*', '/source/export'] as const;

// Anything not listed here is wider. A trailing ** also matches the path itself.
export const EQUIVALENT_PATHS: readonly EquivalentPath[] = [
  ...MAPPED_ROOTS.flatMap((root) => [
    ...SAMPLE_VALUE_FIELDS.map(
      (field): EquivalentPath => ({
        pattern: `${root}/mapping/${field}`,
        evidence: 'sample_values',
      }),
    ),
    { pattern: `${root}/recordSelector`, evidence: 'selector_overlap' } satisfies EquivalentPath,
  ]),
  ...PAGINATOR_FIELDS.map(
    (field): EquivalentPath => ({
      pattern: `/source/spec/streams/*/paginator/${field}`,
      evidence: 'paging',
    }),
  ),
  { pattern: '/source/spec/streams/*/cursor/**', evidence: 'paging' },
];

const MIN_SAMPLE_RECORDS = 3;
const MIN_DISTINCT_VALUES = 2;
const LIMIT_FIELDS: ReadonlySet<string> = new Set(['initialPullRecords', 'dailyRecords']);
const SCOPE_TAIL = ['mapping', 'sensitivity', 'restrictedScope'] as const;
const WILDCARD = '*';
const REST_WILDCARD = '**';

type Segments = readonly string[];
type ChangeKind = 'added' | 'removed' | 'changed';

interface PathChange {
  readonly path: Segments;
  readonly kind: ChangeKind;
  readonly prev: unknown;
  readonly next: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function sameValue(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function pathMatches(pattern: string, path: Segments): boolean {
  const parts = pattern.split('/').slice(1);
  const rest = parts.at(-1) === REST_WILDCARD;
  const fixed = rest ? parts.slice(0, -1) : parts;
  if (rest ? path.length < fixed.length : path.length !== fixed.length) return false;
  return fixed.every((part, index) => part === WILDCARD || part === path[index]);
}

function endsWith(path: Segments, tail: readonly string[]): boolean {
  return (
    path.length >= tail.length &&
    tail.every((part, i) => path[path.length - tail.length + i] === part)
  );
}

class JsonPathDiff {
  changes(prev: unknown, next: unknown): readonly PathChange[] {
    const found: PathChange[] = [];
    this.compare(prev, next, [], found);
    return found;
  }

  private compare(prev: unknown, next: unknown, path: Segments, found: PathChange[]): void {
    if (this.isAtomic(path) || !this.bothContainers(prev, next)) {
      if (!sameValue(prev, next)) found.push({ path, kind: 'changed', prev, next });
      return;
    }
    if (Array.isArray(prev) && Array.isArray(next)) {
      const length = Math.max(prev.length, next.length);
      for (let i = 0; i < length; i += 1) this.entry(prev[i], next[i], [...path, String(i)], found);
      return;
    }
    const left = prev as Record<string, unknown>;
    const right = next as Record<string, unknown>;
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (path.length === 0 && key === 'revision') continue;
      this.entry(left[key], right[key], [...path, key], found);
    }
  }

  private entry(prev: unknown, next: unknown, path: Segments, found: PathChange[]): void {
    if (prev === undefined && next === undefined) return;
    if (prev === undefined) found.push({ path, kind: 'added', prev, next });
    else if (next === undefined) found.push({ path, kind: 'removed', prev, next });
    else this.compare(prev, next, path, found);
  }

  private bothContainers(prev: unknown, next: unknown): boolean {
    return (Array.isArray(prev) && Array.isArray(next)) || (isRecord(prev) && isRecord(next));
  }

  private isAtomic(path: Segments): boolean {
    return endsWith(path, SCOPE_TAIL);
  }
}

type CustomStream = Extract<
  CustomDefinition['source'],
  { readonly type: 'api' }
>['spec']['streams'][number];

class SampleEvidence {
  constructor(
    private readonly prev: CustomDefinition,
    private readonly next: CustomDefinition,
    private readonly evidence: RevisionEvidence,
  ) {}

  samplesAgree(change: PathChange): boolean {
    const { prev: prevPointer, next: nextPointer } = change;
    if (typeof prevPointer !== 'string' || typeof nextPointer !== 'string') return false;
    const records = this.evidence.freshSamples.get(this.streamIndex(change.path)) ?? [];
    const substantive = new Set<string>();
    let usable = 0;
    for (const record of records) {
      const left = resolveJsonPointer(record, prevPointer);
      const right = resolveJsonPointer(record, nextPointer);
      if (!this.sameOptional(left, right)) return false;
      if (!this.isSubstantive(left)) continue;
      usable += 1;
      substantive.add(canonicalJson(left));
    }
    return usable >= MIN_SAMPLE_RECORDS && substantive.size >= MIN_DISTINCT_VALUES;
  }

  selectorKeepsRecords(change: PathChange): boolean {
    const { prev: prevSelector, next: nextSelector } = change;
    if (typeof prevSelector !== 'string' || typeof nextSelector !== 'string') return false;
    const index = this.streamIndex(change.path);
    const responses = this.evidence.freshResponses.get(index) ?? [];
    const before = this.selectedById(responses, prevSelector, this.idPointer(this.prev, index));
    const after = this.selectedById(responses, nextSelector, this.idPointer(this.next, index));
    if (before === null || after === null || after.size < MIN_SAMPLE_RECORDS) return false;
    return [...after].every(([id, record]) => {
      const old = before.get(id);
      return old !== undefined && this.mappedValuesAgree(old, record, index);
    });
  }

  pagingAllowed(change: PathChange): boolean {
    const index = this.streamIndex(change.path);
    const streams = [this.streamOf(this.prev, index), this.streamOf(this.next, index)];
    return streams.every(
      (stream) =>
        stream !== undefined &&
        stream.request.method === 'GET' &&
        this.pagingNames(stream).every((name) => PAGING_PARAM_NAMES.has(name.toLowerCase())),
    );
  }

  private streamIndex(path: Segments): number {
    return path[1] === 'spec' ? Number(path[3]) : 0;
  }

  private streamOf(definition: CustomDefinition, index: number): CustomStream | undefined {
    const source = definition.source;
    return source.type === 'api' ? source.spec.streams[index] : undefined;
  }

  private mappingOf(definition: CustomDefinition, index: number) {
    const source = definition.source;
    return source.type === 'api'
      ? (source.spec.streams[index]?.mapping ?? null)
      : source.export.mapping;
  }

  private pagingNames(stream: CustomStream): string[] {
    const paginator = stream.paginator;
    return [
      ...('param' in paginator ? [paginator.param] : []),
      ...('limitParam' in paginator ? [paginator.limitParam] : []),
      ...(stream.cursor ? [stream.cursor.param, ...stream.cursor.dropsParams] : []),
    ];
  }

  private idPointer(definition: CustomDefinition, index: number): string | null {
    const mapping = this.mappingOf(definition, index);
    return mapping !== null && 'idPointer' in mapping ? mapping.idPointer : null;
  }

  private selectedById(
    responses: readonly unknown[],
    selector: string,
    idPointer: string | null,
  ): Map<string, unknown> | null {
    if (idPointer === null) return null;
    const byId = new Map<string, unknown>();
    for (const response of responses) {
      const selected = resolveJsonPointer(response, selector);
      for (const record of Array.isArray(selected) ? selected : []) {
        const id = this.idKey(record, idPointer);
        if (id !== null && !byId.has(id)) byId.set(id, record);
      }
    }
    return byId;
  }

  private idKey(record: unknown, idPointer: string): string | null {
    if (!isRecord(record)) return null;
    const id = resolveJsonPointer(record, idPointer);
    const usable = typeof id === 'string' || (typeof id === 'number' && Number.isFinite(id));
    return usable ? JSON.stringify(id) : null;
  }

  private mappedValuesAgree(oldRecord: unknown, newRecord: unknown, index: number): boolean {
    const before = this.pointerFields(this.mappingOf(this.prev, index));
    const after = this.pointerFields(this.mappingOf(this.next, index));
    if (before.size === 0 || before.size !== after.size) return false;
    return [...before].every(([field, pointer]) => {
      const counterpart = after.get(field);
      return (
        counterpart !== undefined &&
        this.sameOptional(
          resolveJsonPointer(oldRecord, pointer),
          resolveJsonPointer(newRecord, counterpart),
        )
      );
    });
  }

  private pointerFields(mapping: ReturnType<SampleEvidence['mappingOf']>): Map<string, string> {
    const fields = new Map<string, string>();
    if (mapping === null) return fields;
    for (const [field, value] of Object.entries(mapping)) {
      if (field.endsWith('Pointer') && typeof value === 'string') fields.set(field, value);
    }
    if ('status' in mapping && mapping.status !== null)
      fields.set('status', mapping.status.pointer);
    if ('sensitivity' in mapping) this.addSensitivityPointers(fields, mapping.sensitivity);
    return fields;
  }

  // A record must not read as public through one selector and restricted through the other.
  private addSensitivityPointers(
    fields: Map<string, string>,
    sensitivity: {
      restrictedScope: { mode: string; pointer?: string };
      namesPointers: readonly string[];
    },
  ): void {
    const scope = sensitivity.restrictedScope;
    if (scope.mode === 'public_when' && scope.pointer !== undefined) {
      fields.set('sensitivity.scope', scope.pointer);
    }
    sensitivity.namesPointers.forEach((pointer, index) => {
      fields.set(`sensitivity.names.${index}`, pointer);
    });
  }

  private sameOptional(left: unknown, right: unknown): boolean {
    if (left === undefined || right === undefined) return left === right;
    return sameValue(left, right);
  }

  // A constant, empty or falsy value would match any pointer that also resolves to nothing useful.
  private isSubstantive(value: unknown): boolean {
    if (typeof value === 'string') return value.trim() !== '';
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
    if (typeof value === 'boolean') return value;
    if (Array.isArray(value)) return value.length > 0;
    return isRecord(value) && Object.keys(value).length > 0;
  }
}

class RevisionClassifier {
  private readonly evidence: SampleEvidence;

  constructor(
    private readonly prev: CustomDefinition,
    private readonly next: CustomDefinition,
    evidence: RevisionEvidence,
  ) {
    this.evidence = new SampleEvidence(prev, next, evidence);
  }

  classify(): CustomRevisionClass {
    this.assertSameIdentity();
    const classes = new JsonPathDiff()
      .changes(this.prev, this.next)
      .map((change) => this.classifyChange(change));
    if (classes.length > 0 && classes.every((c) => c === 'narrower')) return 'narrower';
    return classes.every((c) => c === 'equivalent') ? 'equivalent' : 'wider';
  }

  private assertSameIdentity(): void {
    const same =
      this.prev.slot === this.next.slot &&
      this.prev.definitionId === this.next.definitionId &&
      this.prev.source.type === this.next.source.type &&
      sameValue(this.prev.hosts, this.next.hosts) &&
      this.prev.auth?.mode === this.next.auth?.mode;
    if (!same) throw new CustomRevisionError();
  }

  private classifyChange(change: PathChange): CustomRevisionClass {
    if (this.isNarrowing(change)) return 'narrower';
    return this.isEquivalent(change) ? 'equivalent' : 'wider';
  }

  private isNarrowing(change: PathChange): boolean {
    return (
      this.isStreamRemoval(change) || this.isLoweredLimit(change) || this.isTightenedScope(change)
    );
  }

  private isStreamRemoval({ path, kind }: PathChange): boolean {
    if (kind !== 'removed' || !pathMatches('/source/spec/streams/*', path)) return false;
    const [before, after] = [this.prev.source, this.next.source];
    const index = Number(path[3]);
    return (
      before.type === 'api' &&
      after.type === 'api' &&
      !before.deletion.some((entry) => entry.stream === index)
    );
  }

  private isLoweredLimit({ path, kind, prev, next }: PathChange): boolean {
    return (
      kind === 'changed' &&
      pathMatches('/limits/*', path) &&
      LIMIT_FIELDS.has(path[1] ?? '') &&
      typeof prev === 'number' &&
      typeof next === 'number' &&
      next < prev
    );
  }

  private isTightenedScope({ path, kind, prev, next }: PathChange): boolean {
    if (kind !== 'changed' || !endsWith(path, SCOPE_TAIL) || !isRecord(prev) || !isRecord(next)) {
      return false;
    }
    if (prev['mode'] !== 'public_when') return false;
    if (next['mode'] === 'always') return true;
    return (
      next['mode'] === 'public_when' &&
      next['pointer'] === prev['pointer'] &&
      this.isSubset(next['publicValues'], prev['publicValues'])
    );
  }

  private isSubset(candidate: unknown, whole: unknown): boolean {
    return (
      Array.isArray(candidate) &&
      Array.isArray(whole) &&
      candidate.every((value) => whole.includes(value))
    );
  }

  private isEquivalent(change: PathChange): boolean {
    const allowed = EQUIVALENT_PATHS.find((entry) => pathMatches(entry.pattern, change.path));
    if (allowed === undefined) return false;
    if (allowed.evidence === 'paging') return this.evidence.pagingAllowed(change);
    if (change.kind !== 'changed') return false;
    return allowed.evidence === 'sample_values'
      ? this.evidence.samplesAgree(change)
      : this.evidence.selectorKeepsRecords(change);
  }
}

export function classifyCustomRevision(
  prev: CustomDefinition,
  next: CustomDefinition,
  evidence: RevisionEvidence,
): CustomRevisionClass {
  return new RevisionClassifier(prev, next, evidence).classify();
}

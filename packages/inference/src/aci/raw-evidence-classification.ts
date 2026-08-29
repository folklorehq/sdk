// SPDX-License-Identifier: Apache-2.0
import { parseTree, type Node } from 'jsonc-parser';

const RESERVED_FORMAT = 'dstack-native-evidence';
const MAX_EMBEDDED_JSON_DEPTH = 4;
const MAX_INSPECTION_DEPTH = 64;
const MAX_INSPECTION_NODES = 4_096;
const MAX_INSPECTED_STRING_BYTES = 1_048_576;

type InspectionNode = {
  readonly node: Node;
  readonly depth: number;
  readonly embeddedDepth: number;
};

type InspectionState = {
  nodes: number;
  stringBytes: number;
};

export function containsReservedRawEvidenceMarker(bytes: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const parsed = parseJson(text);
  if (parsed.root === undefined) return isJsonShaped(text);
  return !parsed.isComplete || isReservedOrUnsafe(parsed.root);
}

export function containsReservedReportEvidenceMarker(bytes: Uint8Array): boolean {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const parsed = parseJson(text);
  if (parsed.root === undefined) return isJsonShaped(text);
  if (!parsed.isComplete) return true;
  const root = parsed.root;
  if (root?.type !== 'object') return false;
  return propertyValues(root, 'attestation').some(
    (attestation) =>
      attestation.type === 'object' &&
      propertyValues(attestation, 'evidence').some((evidence) => isReservedOrUnsafe(evidence)),
  );
}

function isReservedOrUnsafe(root: Node): boolean {
  const state: InspectionState = { nodes: 0, stringBytes: 0 };
  const stack: InspectionNode[] = [{ node: root, depth: 0, embeddedDepth: 0 }];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    state.nodes += 1;
    if (state.nodes > MAX_INSPECTION_NODES || current.depth > MAX_INSPECTION_DEPTH) return true;
    if (isReservedFormatProperty(current.node)) return true;
    if (isStringNode(current.node)) {
      state.stringBytes += Buffer.byteLength(current.node.value, 'utf8');
      if (state.stringBytes > MAX_INSPECTED_STRING_BYTES) return true;
      const embedded = parseEmbeddedJson(current.node.value);
      if (embedded !== null) {
        if (
          current.embeddedDepth >= MAX_EMBEDDED_JSON_DEPTH ||
          embedded.root === undefined ||
          !embedded.isComplete
        )
          return true;
        stack.push({
          node: embedded.root,
          depth: current.depth + 1,
          embeddedDepth: current.embeddedDepth + 1,
        });
      }
    }
    for (const child of current.node.children ?? []) {
      stack.push({
        node: child,
        depth: current.depth + 1,
        embeddedDepth: current.embeddedDepth,
      });
    }
  }
  return false;
}

function isReservedFormatProperty(node: Node): boolean {
  return (
    node.type === 'property' &&
    node.children?.[0]?.value === 'format' &&
    node.children[1]?.type === 'string' &&
    node.children[1].value === RESERVED_FORMAT
  );
}

function isStringNode(node: Node): node is Node & { readonly value: string } {
  return node.type === 'string' && typeof node.value === 'string';
}

function parseEmbeddedJson(text: string): ParsedJson | null {
  const trimmed = text.trimStart();
  if (trimmed.length === 0 || !['{', '[', '"'].includes(trimmed[0] ?? '')) return null;
  return parseJson(text);
}

type ParsedJson = {
  readonly root: Node | undefined;
  readonly isComplete: boolean;
};

function parseJson(text: string): ParsedJson {
  const errors: Parameters<typeof parseTree>[1] = [];
  const root = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true });
  return { root, isComplete: errors.length === 0 };
}

function isJsonShaped(text: string): boolean {
  const trimmed = text.replace(/^\uFEFF/, '').trimStart();
  return ['{', '[', '"'].includes(trimmed[0] ?? '');
}

function propertyValues(object: Node, propertyName: string): Node[] {
  return (object.children ?? []).flatMap((property) => {
    if (property.type !== 'property' || property.children?.[0]?.value !== propertyName) return [];
    const value = property.children[1];
    return value === undefined ? [] : [value];
  });
}

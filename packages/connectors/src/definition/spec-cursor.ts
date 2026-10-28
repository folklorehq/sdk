// SPDX-License-Identifier: Apache-2.0
import {
  SPEC_MAX_ENVELOPE_BYTES,
  SPEC_MAX_STREAM_STATE_BYTES,
  cursorEnvelopeSchema,
  specStreamStateSchema,
  type ConnectorSpec,
  type SpecStreamState,
} from '@folklore/contracts';
import { ConnectorSpecError } from '@folklore/errors';

type Envelope = ReturnType<typeof cursorEnvelopeSchema.parse>;

const ENVELOPE_VERSION = 1;
const encoder = new TextEncoder();

export function emptyStreamState(): SpecStreamState {
  return { c: null, m: null, d: false, p: null, i: null, k: null, w: null };
}

export function isCursorEnvelope(value: string | null): boolean {
  return parseEnvelope(value) !== null;
}

export function readSpecCursor(
  spec: ConnectorSpec,
  value: string | null,
): ReadonlyMap<string, SpecStreamState> {
  const envelope = parseEnvelope(value);
  return new Map(
    spec.streams.map((stream) => [
      stream.name,
      envelope ? storedState(envelope, stream.name) : bareState(spec, value),
    ]),
  );
}

export function writeSpecCursor(
  spec: ConnectorSpec,
  states: ReadonlyMap<string, SpecStreamState>,
): string | null {
  const ordered = spec.streams.map(
    (stream) => [stream.name, states.get(stream.name) ?? emptyStreamState()] as const,
  );
  if (ordered.every(([, state]) => isEmpty(state))) return null;
  const [first] = ordered;
  const only = ordered.length === 1 && first ? first[1] : null;
  if (only && isFinished(only)) return only.c;
  return serializeEnvelope(ordered);
}

function parseEnvelope(value: string | null): Envelope | null {
  if (!value) return null;
  try {
    const parsed = cursorEnvelopeSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function storedState(envelope: Envelope, name: string): SpecStreamState {
  const raw = Object.hasOwn(envelope.streams, name) ? envelope.streams[name] : undefined;
  if (raw === undefined) return emptyStreamState();
  try {
    const parsed = specStreamStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyStreamState();
  } catch {
    return emptyStreamState();
  }
}

function bareState(spec: ConnectorSpec, value: string | null): SpecStreamState {
  return spec.streams.length === 1 && value
    ? { ...emptyStreamState(), c: value }
    : emptyStreamState();
}

function isEmpty(state: SpecStreamState): boolean {
  return state.c === null && isFinished(state);
}

function isFinished(state: SpecStreamState): boolean {
  return (
    state.m === null &&
    !state.d &&
    state.p === null &&
    state.i === null &&
    state.k === null &&
    state.w === null
  );
}

function serializeEnvelope(ordered: ReadonlyArray<readonly [string, SpecStreamState]>): string {
  const streams: Record<string, string> = {};
  for (const [name, state] of ordered) streams[name] = serializeState(state);
  const serialized = JSON.stringify({ v: ENVELOPE_VERSION, streams });
  if (byteLength(serialized) > SPEC_MAX_ENVELOPE_BYTES) {
    throw new ConnectorSpecError('spec_cursor_too_long');
  }
  return serialized;
}

function serializeState(state: SpecStreamState): string {
  const serialized = JSON.stringify(state);
  if (
    !specStreamStateSchema.safeParse(state).success ||
    byteLength(serialized) > SPEC_MAX_STREAM_STATE_BYTES
  ) {
    throw new ConnectorSpecError('spec_cursor_too_long');
  }
  return serialized;
}

function byteLength(text: string): number {
  return encoder.encode(text).length;
}

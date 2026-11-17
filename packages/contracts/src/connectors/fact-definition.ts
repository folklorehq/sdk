// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { containerLabelSchema } from './container-labels.js';
import { SECRET_KEY_TOKENS, wordTokens } from './custom/read-semantics.js';
import { jsonPointerSchema } from './manifest.js';
import type { FactMapping } from './stream-spec.js';

export const FACT_MAX_ATTRIBUTES = 12;
export const FACT_SHORT_TEXT_MAX_BYTES = 1024;
export const FACT_LONG_TEXT_MAX_BYTES = 65_536;
export const FACT_MAX_NAME_FIELDS = 4;

const ARRAY_INDEX_SEGMENT = /^\d+$/;
const NON_ALPHANUMERIC = /[^a-z0-9]/g;
const STRONG_SECRET_WORDS = [
  'password',
  'passwd',
  'secret',
  'token',
  'credential',
  'apikey',
  'privatekey',
];
const FACT_LABEL = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,39}$/;

const unescapeSegment = (segment: string): string =>
  segment.replaceAll('~1', '/').replaceAll('~0', '~');

// Plurals and unseparated compounds ("apitoken", "passwordhash") slip past whole-word matching.
function namesSecret(segment: string): boolean {
  const words = wordTokens(segment).flatMap((word) =>
    word.endsWith('s') ? [word, word.slice(0, -1)] : [word],
  );
  if (words.some((word) => SECRET_KEY_TOKENS.has(word))) return true;
  const squashed = segment.toLowerCase().replace(NON_ALPHANUMERIC, '');
  return STRONG_SECRET_WORDS.some((word) => squashed.includes(word));
}

const isReadablePointer = (pointer: string): boolean =>
  pointer !== '' &&
  pointer
    .slice(1)
    .split('/')
    .map(unescapeSegment)
    .every((segment) => !ARRAY_INDEX_SEGMENT.test(segment) && !namesSecret(segment));

// Never the whole record, never an array index, never a segment that names a secret.
export const recordPointerSchema = jsonPointerSchema.refine(
  isReadablePointer,
  'pointer is not readable',
);

export const FACT_FIELD_TYPES = [
  'short_text',
  'long_text',
  'number',
  'boolean',
  'timestamp',
] as const;
export const factFieldTypeSchema = z.enum(FACT_FIELD_TYPES);
export type FactFieldType = z.infer<typeof factFieldTypeSchema>;

export const factFieldSchema = z
  .object({
    pointer: recordPointerSchema,
    type: factFieldTypeSchema,
    maxBytes: z.number().int().min(1).max(FACT_LONG_TEXT_MAX_BYTES),
    required: z.boolean(),
  })
  .strict()
  .refine(
    (field) => field.type === 'long_text' || field.maxBytes <= FACT_SHORT_TEXT_MAX_BYTES,
    'maxBytes over the short limit',
  );
export type FactField = z.infer<typeof factFieldSchema>;

function slotField(types: readonly FactFieldType[], mustBeRequired = false) {
  return factFieldSchema.refine(
    (field) => types.includes(field.type) && (!mustBeRequired || field.required),
    'field does not fit its slot',
  );
}

const idFieldSchema = slotField(['short_text', 'number'], true);
const authorFieldSchema = slotField(['short_text', 'number']);
const timestampFieldSchema = slotField(['timestamp']);
const titleFieldSchema = slotField(['short_text']);
const bodyFieldSchema = slotField(['long_text', 'short_text']);
const attributeFieldSchema = slotField(['short_text', 'number', 'boolean']);
const textFieldSchema = slotField(['short_text']);
const scopeFieldSchema = slotField(['short_text', 'boolean']);

export const factLabelSchema = z.string().regex(FACT_LABEL);

export const factAttributeSchema = z
  .object({ label: factLabelSchema, field: attributeFieldSchema })
  .strict();

const namesSchema = z.array(textFieldSchema).max(FACT_MAX_NAME_FIELDS).readonly();

export const factSensitivitySchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('always'), names: namesSchema }).strict(),
  z
    .object({
      mode: z.literal('public_when'),
      field: scopeFieldSchema,
      publicValues: z
        .array(z.union([z.string(), z.boolean()]))
        .min(1)
        .readonly(),
      names: namesSchema,
    })
    .strict(),
]);

export const factGuardsSchema = z
  .object({ onSensitiveValue: z.enum(['redact', 'drop_record']) })
  .strict();

export const FACT_OUTCOME_CODES = [
  'missing_required',
  'wrong_type',
  'too_large',
  'identity_sensitive',
  'timestamp_out_of_range',
  'sensitive_value_redacted',
] as const;
export type FactOutcomeCode = (typeof FACT_OUTCOME_CODES)[number];

export const transitionTypeSchema = z.enum(['opened', 'closed', 'merged', 'reopened', 'cancelled']);

export const factDefinitionObjectSchema = z
  .object({
    shape: z.literal('fact'),
    role: z.enum(['item', 'comment']),
    containerLabel: containerLabelSchema.nullable(),
    id: idFieldSchema,
    parentId: idFieldSchema.nullable(),
    title: titleFieldSchema.nullable(),
    body: bodyFieldSchema.nullable(),
    author: authorFieldSchema.nullable(),
    createdAt: timestampFieldSchema,
    updatedAt: timestampFieldSchema.nullable(),
    status: z
      .object({ field: textFieldSchema, map: z.record(transitionTypeSchema) })
      .strict()
      .nullable(),
    attributes: z.array(factAttributeSchema).max(FACT_MAX_ATTRIBUTES).readonly(),
    sensitivity: factSensitivitySchema,
    guards: factGuardsSchema,
  })
  .strict();

export type FactDefinition = Extract<FactMapping, { shape: 'fact' }>;

export type FactSlot =
  | 'id'
  | 'parentId'
  | 'title'
  | 'body'
  | 'author'
  | 'createdAt'
  | 'updatedAt'
  | 'status'
  | 'sensitivity'
  | 'name'
  | 'attribute';

export interface DeclaredField {
  readonly slot: FactSlot;
  readonly field: FactField;
  readonly identity: boolean;
}

const IDENTITY_SLOTS: ReadonlySet<FactSlot> = new Set([
  'id',
  'parentId',
  'author',
  'createdAt',
  'updatedAt',
]);

// A fixed order: the projection, the approval list and the pointer check all walk it.
export function declaredFields(mapping: FactDefinition): readonly DeclaredField[] {
  const slots: ReadonlyArray<readonly [FactSlot, FactField | null]> = [
    ['id', mapping.id],
    ['parentId', mapping.parentId],
    ['title', mapping.title],
    ['body', mapping.body],
    ['author', mapping.author],
    ['createdAt', mapping.createdAt],
    ['updatedAt', mapping.updatedAt],
    ['status', mapping.status?.field ?? null],
    ['sensitivity', mapping.sensitivity.mode === 'public_when' ? mapping.sensitivity.field : null],
    ...mapping.sensitivity.names.map((field): readonly [FactSlot, FactField] => ['name', field]),
    ...mapping.attributes.map((attribute): readonly [FactSlot, FactField] => [
      'attribute',
      attribute.field,
    ]),
  ];
  return slots.flatMap(([slot, field]) =>
    field === null ? [] : [{ slot, field, identity: IDENTITY_SLOTS.has(slot) }],
  );
}

function roleIssues(mapping: FactDefinition): string[] {
  const item = mapping.role === 'item';
  return [
    ...((mapping.containerLabel !== null) !== item
      ? ['container label does not fit the role']
      : []),
    ...(!item && mapping.status !== null ? ['only an item has a status'] : []),
    ...(item && mapping.parentId !== null ? ['only a comment has a parent id'] : []),
  ];
}

function hasDuplicatePointer(mapping: FactDefinition): boolean {
  const pointers = declaredFields(mapping).map(({ field }) => field.pointer);
  return new Set(pointers).size !== pointers.length;
}

export function factDefinitionIssues(mapping: FactDefinition, ctx: z.RefinementCtx): void {
  for (const message of roleIssues(mapping)) ctx.addIssue({ code: 'custom', message });
  if (hasDuplicatePointer(mapping)) {
    ctx.addIssue({ code: 'custom', message: 'a pointer is declared twice' });
  }
}

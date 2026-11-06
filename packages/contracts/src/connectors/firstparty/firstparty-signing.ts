// SPDX-License-Identifier: Apache-2.0
import { canonicalJson } from '@folklore/utils/canonical-json-pure';
import { utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { sha256Hex } from './firstparty-digest.js';
import { firstpartyDefinitionSchema, type FirstpartyDefinition } from './firstparty-definition.js';
import { FIRSTPARTY_SLOT_KINDS } from './firstparty-slot-kinds.js';

export const FIRSTPARTY_DEFINITION_SIGNING_DOMAIN = 'folklore.firstparty-connector.v1';

export const firstpartyDefinitionEnvelopeSchema = z
  .object({
    slot: z.enum(FIRSTPARTY_SLOT_KINDS),
    definitionId: z.string().uuid(),
    revision: z.number().int().min(1),
    definition: firstpartyDefinitionSchema,
  })
  .strict()
  .refine((envelope) => envelope.slot === envelope.definition.slot, 'slot mismatch');

export type FirstpartyDefinitionEnvelope = z.infer<typeof firstpartyDefinitionEnvelopeSchema>;

export function firstpartyDefinitionSigningBytes(
  envelope: FirstpartyDefinitionEnvelope,
): Uint8Array {
  if (envelope.slot !== envelope.definition.slot) {
    throw new Error('firstparty_slot_mismatch');
  }
  return utf8ToBytes(
    canonicalJson({
      domain: FIRSTPARTY_DEFINITION_SIGNING_DOMAIN,
      slot: envelope.slot,
      definitionId: envelope.definitionId,
      revision: envelope.revision,
      definition: envelope.definition,
    }),
  );
}

export const firstpartyDefinitionSha256 = (definition: FirstpartyDefinition): string =>
  sha256Hex(canonicalJson(definition));

// SPDX-License-Identifier: Apache-2.0
export const FIRSTPARTY_SLOT_KINDS = [
  'firstparty_1',
  'firstparty_2',
  'firstparty_3',
  'firstparty_4',
  'firstparty_5',
  'firstparty_6',
  'firstparty_7',
  'firstparty_8',
  'firstparty_9',
  'firstparty_10',
  'firstparty_11',
  'firstparty_12',
  'firstparty_13',
  'firstparty_14',
  'firstparty_15',
  'firstparty_16',
  'firstparty_17',
  'firstparty_18',
  'firstparty_19',
  'firstparty_20',
] as const;
export type FirstpartySlotKind = (typeof FIRSTPARTY_SLOT_KINDS)[number];
export const FIRSTPARTY_CONTAINER_LABEL = 'firstparty_record';

export const isFirstpartySlotKind = (kind: string): kind is FirstpartySlotKind =>
  (FIRSTPARTY_SLOT_KINDS as readonly string[]).includes(kind);

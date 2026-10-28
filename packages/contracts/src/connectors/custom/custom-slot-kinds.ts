// SPDX-License-Identifier: Apache-2.0
export const CUSTOM_SLOT_KINDS = [
  'custom_1',
  'custom_2',
  'custom_3',
  'custom_4',
  'custom_5',
  'custom_6',
  'custom_7',
  'custom_8',
  'custom_9',
  'custom_10',
] as const;
export type CustomSlotKind = (typeof CUSTOM_SLOT_KINDS)[number];
export const CUSTOM_CONTAINER_LABEL = 'custom_record';

export const isCustomSlotKind = (kind: string): kind is CustomSlotKind =>
  (CUSTOM_SLOT_KINDS as readonly string[]).includes(kind);

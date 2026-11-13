// SPDX-License-Identifier: Apache-2.0
export const SEALED_TITLE_KINDS = ['theme_name', 'publication_title'] as const;
export type SealedTitleKind = (typeof SEALED_TITLE_KINDS)[number];

export const SEALED_TITLE_PLACEHOLDER = 'Untitled';

export const sealedTitleKey = (kind: SealedTitleKind, subjectId: string): string =>
  `${kind}:${subjectId}`;

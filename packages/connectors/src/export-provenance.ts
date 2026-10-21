// SPDX-License-Identifier: Apache-2.0
export const EXPORT_PROVENANCE_FOOTER =
  'Maintained by Folklore. Edits made here are replaced at the next update.';

const FOOTER_SEPARATOR = '\n\n';

export function withExportProvenanceFooter(markdown: string): string {
  return `${markdown}${FOOTER_SEPARATOR}${EXPORT_PROVENANCE_FOOTER}`;
}

export function isExportProvenanceFooter(text: string): boolean {
  return text.trim() === EXPORT_PROVENANCE_FOOTER;
}

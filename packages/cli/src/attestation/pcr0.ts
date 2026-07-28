// SPDX-License-Identifier: Apache-2.0
export const PCR0_HEX_LENGTH = 96;

export const PCR0_DEBUG = '0'.repeat(PCR0_HEX_LENGTH);

export function isValidPcr0Hex(value: string): boolean {
  return /^[0-9a-f]{96}$/i.test(value);
}

export function isDebugPcr0(value: string): boolean {
  return value.toLowerCase() === PCR0_DEBUG;
}

export function normalizePcr0(value: string): string {
  return value.toLowerCase();
}

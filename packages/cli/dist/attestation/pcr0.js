// SPDX-License-Identifier: Apache-2.0
export const PCR0_HEX_LENGTH = 96;
export const PCR0_DEBUG = '0'.repeat(PCR0_HEX_LENGTH);
export function isValidPcr0Hex(value) {
    return /^[0-9a-f]{96}$/i.test(value);
}
export function isDebugPcr0(value) {
    return value.toLowerCase() === PCR0_DEBUG;
}
export function normalizePcr0(value) {
    return value.toLowerCase();
}
//# sourceMappingURL=pcr0.js.map
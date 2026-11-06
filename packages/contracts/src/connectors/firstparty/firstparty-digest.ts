// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const sha256Hex = (value: string): string => bytesToHex(sha256(utf8ToBytes(value)));

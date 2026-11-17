// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const FIRSTPARTY_KIND = 'firstparty' as const;
export const FIRSTPARTY_CONTAINER_LABEL = 'firstparty_record';
export const FIRSTPARTY_MAX_LIVE_CONNECTORS = 200;
export type FirstpartySourceKey = `firstparty_${number}`;

const FIRSTPARTY_SOURCE_KEY = /^firstparty_[1-9][0-9]{0,3}$/;

export const isFirstpartySourceKey = (key: string): key is FirstpartySourceKey =>
  FIRSTPARTY_SOURCE_KEY.test(key);

export const firstpartySourceKeySchema = z.string().refine(isFirstpartySourceKey);

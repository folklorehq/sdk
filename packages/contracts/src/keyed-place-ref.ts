// SPDX-License-Identifier: Apache-2.0
import { KEYED_PLACE_REF_PATTERN } from '@folklore/utils/place-keys';
import { z } from 'zod';

export const keyedPlaceRefSchema = z.string().regex(KEYED_PLACE_REF_PATTERN);

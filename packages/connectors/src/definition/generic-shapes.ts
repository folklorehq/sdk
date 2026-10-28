// SPDX-License-Identifier: Apache-2.0
import type { ShapeAdapters } from './shape-adapters.js';
import { CommentShape } from './shapes/CommentShape.js';
import { ItemShape } from './shapes/ItemShape.js';

export const GENERIC_SHAPE_ADAPTERS = {
  item: new ItemShape(),
  comment: new CommentShape(),
} satisfies ShapeAdapters;

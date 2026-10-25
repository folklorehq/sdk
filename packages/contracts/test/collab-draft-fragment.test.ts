// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { COLLAB_DRAFT_FRAGMENT } from '../src/collab.js';

describe('COLLAB_DRAFT_FRAGMENT', () => {
  it('is the Yjs fragment the editor and the server both read the page draft from', () => {
    expect(COLLAB_DRAFT_FRAGMENT).toBe('default');
  });
});

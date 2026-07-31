// SPDX-License-Identifier: Apache-2.0
import { LinearClient } from '@linear/sdk';
import { describe, expect, it, vi } from 'vitest';
import { LinearSdkClient } from '../src/linear/LinearSdkClient.js';

vi.mock('@linear/sdk', () => ({
  LinearClient: vi.fn(),
}));

describe('LinearSdkClient', () => {
  it('passes the OAuth token as accessToken, not apiKey', () => {
    new LinearSdkClient('oauth-token-value');

    expect(vi.mocked(LinearClient).mock.calls[0]).toEqual([{ accessToken: 'oauth-token-value' }]);
  });
});

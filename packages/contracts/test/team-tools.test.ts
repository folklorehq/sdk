// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { TEAM_TOOL_KINDS, teamToolsInputSchema, teamToolsSchema } from '../src/onboarding.js';

const TEAM_ID = '7f8c1c1e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const MANDATORY_GITHUB = { sourceKind: 'github', mandatory: true };

describe('team tools contracts', () => {
  it('refuses a mandatory link on a kind that cannot link yet in a write', () => {
    expect(teamToolsInputSchema.safeParse({ tools: [MANDATORY_GITHUB] }).success).toBe(false);
  });

  it('refuses more tools than there are kinds', () => {
    const tools = Array.from({ length: TEAM_TOOL_KINDS.length + 1 }, () => ({
      sourceKind: 'slack',
      mandatory: false,
    }));
    const result = teamToolsInputSchema.safeParse({ tools });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.code)).toContain('too_big');
  });

  it('accepts a stored mandatory row on such a kind in the read response', () => {
    const view = { teamId: TEAM_ID, tools: [MANDATORY_GITHUB], canEdit: true };
    expect(teamToolsSchema.safeParse(view).success).toBe(true);
  });

  it('refuses a read response whose team id is not a uuid', () => {
    expect(teamToolsSchema.safeParse({ teamId: 'team-1', tools: [], canEdit: false }).success).toBe(
      false,
    );
  });
});

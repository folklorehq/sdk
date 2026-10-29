// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { TEAM_TOOL_KINDS, teamToolsInputSchema, teamToolsSchema } from '../src/onboarding.js';

const TEAM_ID = '7f8c1c1e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const MANDATORY_GITHUB = { sourceKind: 'github', mandatory: true };
const MANDATORY_NOTION = { sourceKind: 'notion', mandatory: true };

describe('team tools contracts', () => {
  it('accepts a mandatory github link in a write', () => {
    expect(teamToolsInputSchema.safeParse({ tools: [MANDATORY_GITHUB] }).success).toBe(true);
  });

  it('refuses a mandatory link on a kind that cannot link yet in a write', () => {
    expect(teamToolsInputSchema.safeParse({ tools: [MANDATORY_NOTION] }).success).toBe(false);
  });

  it('accepts an optional slack link in a write', () => {
    const slack = { tools: [{ sourceKind: 'slack', mandatory: false }] };
    expect(teamToolsInputSchema.safeParse(slack).success).toBe(true);
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
    const view = {
      teamId: TEAM_ID,
      tools: [MANDATORY_GITHUB, MANDATORY_NOTION],
      canEdit: true,
      linkableKinds: ['github'],
    };
    expect(teamToolsSchema.safeParse(view).success).toBe(true);
  });

  it('refuses a read response whose team id is not a uuid', () => {
    expect(
      teamToolsSchema.safeParse({ teamId: 'team-1', tools: [], canEdit: false, linkableKinds: [] })
        .success,
    ).toBe(false);
  });

  it('requires linkableKinds in the read response', () => {
    const view = { teamId: TEAM_ID, tools: [], canEdit: true };
    expect(teamToolsSchema.safeParse(view).success).toBe(false);
    expect(teamToolsSchema.safeParse({ ...view, linkableKinds: [] }).success).toBe(true);
  });

  it('refuses a linkable kind that is not a team tool kind', () => {
    const view = { teamId: TEAM_ID, tools: [], canEdit: true, linkableKinds: ['gmail'] };
    expect(teamToolsSchema.safeParse(view).success).toBe(false);
  });
});

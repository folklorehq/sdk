// SPDX-License-Identifier: Apache-2.0
export type SensitivityLevel = 'public' | 'team_scoped' | 'restricted' | 'confidential';

const SENSITIVITY_ORDER: Record<SensitivityLevel, number> = {
  public: 0,
  team_scoped: 1,
  restricted: 2,
  confidential: 3,
};

export interface AudienceAccess {
  audienceIds: string[];
  allowedSourceKinds: string[];
  maxSensitivity: SensitivityLevel;
}

export function isSensitivityWithin(level: SensitivityLevel, max: SensitivityLevel): boolean {
  return SENSITIVITY_ORDER[level] <= SENSITIVITY_ORDER[max];
}

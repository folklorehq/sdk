export type SensitivityLevel = 'public' | 'team_scoped' | 'restricted' | 'confidential';
export interface AudienceAccess {
    audienceIds: string[];
    allowedSourceKinds: string[];
    maxSensitivity: SensitivityLevel;
}
export declare function isSensitivityWithin(level: SensitivityLevel, max: SensitivityLevel): boolean;
//# sourceMappingURL=sensitivity.d.ts.map
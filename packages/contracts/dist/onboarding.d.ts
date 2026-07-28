import { z } from 'zod';
export declare const onboardingPersonGapSchema: z.ZodObject<{
    userId: z.ZodString;
    name: z.ZodString;
    required: z.ZodArray<z.ZodString, "many">;
    linked: z.ZodArray<z.ZodString, "many">;
    gap: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    userId: string;
    name: string;
    required: string[];
    linked: string[];
    gap: string[];
}, {
    userId: string;
    name: string;
    required: string[];
    linked: string[];
    gap: string[];
}>;
export type OnboardingPersonGap = z.infer<typeof onboardingPersonGapSchema>;
export declare const onboardingPersonSchema: z.ZodObject<{
    userId: z.ZodString;
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    userId: string;
    name: string;
}, {
    userId: string;
    name: string;
}>;
export type OnboardingPerson = z.infer<typeof onboardingPersonSchema>;
export declare const onboardingThemeSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    name: string;
}, {
    id: string;
    name: string;
}>;
export type OnboardingTheme = z.infer<typeof onboardingThemeSchema>;
export declare const leadTeamReadinessSchema: z.ZodObject<{
    team: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>;
    memberCount: z.ZodNumber;
    readyCount: z.ZodNumber;
    gapCount: z.ZodNumber;
    missingSourceKinds: z.ZodArray<z.ZodString, "many">;
    members: z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        name: z.ZodString;
        required: z.ZodArray<z.ZodString, "many">;
        linked: z.ZodArray<z.ZodString, "many">;
        gap: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }, {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    members: {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }[];
    team: {
        id: string;
        name: string;
    };
    memberCount: number;
    readyCount: number;
    gapCount: number;
    missingSourceKinds: string[];
}, {
    members: {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }[];
    team: {
        id: string;
        name: string;
    };
    memberCount: number;
    readyCount: number;
    gapCount: number;
    missingSourceKinds: string[];
}>;
export type LeadTeamReadiness = z.infer<typeof leadTeamReadinessSchema>;
export declare const leadReadinessSchema: z.ZodObject<{
    teams: z.ZodArray<z.ZodObject<{
        team: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            id: string;
            name: string;
        }, {
            id: string;
            name: string;
        }>;
        memberCount: z.ZodNumber;
        readyCount: z.ZodNumber;
        gapCount: z.ZodNumber;
        missingSourceKinds: z.ZodArray<z.ZodString, "many">;
        members: z.ZodArray<z.ZodObject<{
            userId: z.ZodString;
            name: z.ZodString;
            required: z.ZodArray<z.ZodString, "many">;
            linked: z.ZodArray<z.ZodString, "many">;
            gap: z.ZodArray<z.ZodString, "many">;
        }, "strict", z.ZodTypeAny, {
            userId: string;
            name: string;
            required: string[];
            linked: string[];
            gap: string[];
        }, {
            userId: string;
            name: string;
            required: string[];
            linked: string[];
            gap: string[];
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        members: {
            userId: string;
            name: string;
            required: string[];
            linked: string[];
            gap: string[];
        }[];
        team: {
            id: string;
            name: string;
        };
        memberCount: number;
        readyCount: number;
        gapCount: number;
        missingSourceKinds: string[];
    }, {
        members: {
            userId: string;
            name: string;
            required: string[];
            linked: string[];
            gap: string[];
        }[];
        team: {
            id: string;
            name: string;
        };
        memberCount: number;
        readyCount: number;
        gapCount: number;
        missingSourceKinds: string[];
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    teams: {
        members: {
            userId: string;
            name: string;
            required: string[];
            linked: string[];
            gap: string[];
        }[];
        team: {
            id: string;
            name: string;
        };
        memberCount: number;
        readyCount: number;
        gapCount: number;
        missingSourceKinds: string[];
    }[];
}, {
    teams: {
        members: {
            userId: string;
            name: string;
            required: string[];
            linked: string[];
            gap: string[];
        }[];
        team: {
            id: string;
            name: string;
        };
        memberCount: number;
        readyCount: number;
        gapCount: number;
        missingSourceKinds: string[];
    }[];
}>;
export type LeadReadiness = z.infer<typeof leadReadinessSchema>;
export declare const teamOnboardingViewSchema: z.ZodObject<{
    team: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>;
    viewerIsLead: z.ZodBoolean;
    tooling: z.ZodArray<z.ZodString, "many">;
    self: z.ZodObject<{
        userId: z.ZodString;
        name: z.ZodString;
        required: z.ZodArray<z.ZodString, "many">;
        linked: z.ZodArray<z.ZodString, "many">;
        gap: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }, {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }>;
    memberGaps: z.ZodNullable<z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        name: z.ZodString;
        required: z.ZodArray<z.ZodString, "many">;
        linked: z.ZodArray<z.ZodString, "many">;
        gap: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }, {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }>, "many">>;
    keyThemes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>, "many">;
    leads: z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        userId: string;
        name: string;
    }, {
        userId: string;
        name: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    team: {
        id: string;
        name: string;
    };
    viewerIsLead: boolean;
    tooling: string[];
    self: {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    };
    memberGaps: {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }[] | null;
    keyThemes: {
        id: string;
        name: string;
    }[];
    leads: {
        userId: string;
        name: string;
    }[];
}, {
    team: {
        id: string;
        name: string;
    };
    viewerIsLead: boolean;
    tooling: string[];
    self: {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    };
    memberGaps: {
        userId: string;
        name: string;
        required: string[];
        linked: string[];
        gap: string[];
    }[] | null;
    keyThemes: {
        id: string;
        name: string;
    }[];
    leads: {
        userId: string;
        name: string;
    }[];
}>;
export type TeamOnboardingView = z.infer<typeof teamOnboardingViewSchema>;
//# sourceMappingURL=onboarding.d.ts.map
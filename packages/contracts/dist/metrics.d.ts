import { z } from 'zod';
export declare const FACT_METRIC_KEYS: {
    readonly prAdditions: "github.pr.additions";
    readonly prDeletions: "github.pr.deletions";
    readonly prChangedFiles: "github.pr.changed_files";
    readonly prCommentCount: "github.pr.comment_count";
    readonly prTimeToMergeSeconds: "github.pr.time_to_merge_seconds";
    readonly commitChangedFiles: "github.commit.changed_files";
};
export type FactMetricKey = (typeof FACT_METRIC_KEYS)[keyof typeof FACT_METRIC_KEYS];
export declare const factMetricKeySchema: z.ZodEnum<[FactMetricKey, ...FactMetricKey[]]>;
export declare const factMetricUnitSchema: z.ZodEnum<["lines", "files", "seconds", "count"]>;
export type FactMetricUnit = z.infer<typeof factMetricUnitSchema>;
export declare const FACT_METRIC_UNITS: {
    readonly "github.pr.additions": "lines";
    readonly "github.pr.deletions": "lines";
    readonly "github.pr.changed_files": "files";
    readonly "github.pr.comment_count": "count";
    readonly "github.pr.time_to_merge_seconds": "seconds";
    readonly "github.commit.changed_files": "files";
};
export declare const factMetricSchema: z.ZodObject<{
    key: z.ZodEnum<[FactMetricKey, ...FactMetricKey[]]>;
    value: z.ZodNumber;
    unit: z.ZodEnum<["lines", "files", "seconds", "count"]>;
}, "strip", z.ZodTypeAny, {
    value: number;
    key: FactMetricKey;
    unit: "lines" | "files" | "seconds" | "count";
}, {
    value: number;
    key: FactMetricKey;
    unit: "lines" | "files" | "seconds" | "count";
}>;
export type FactMetric = z.infer<typeof factMetricSchema>;
//# sourceMappingURL=metrics.d.ts.map
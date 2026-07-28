// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
// Content-free numeric upstream signals attached to a Fact (ADL #72). Keys are a closed vocabulary
// shared by the connector (producer) and the enclave/worker (consumer) so units never drift; only
// numeric scalars ever cross — never a filename, path, or diff/patch body (ADL #12/#18).
export const FACT_METRIC_KEYS = {
    prAdditions: 'github.pr.additions',
    prDeletions: 'github.pr.deletions',
    prChangedFiles: 'github.pr.changed_files',
    prCommentCount: 'github.pr.comment_count',
    prTimeToMergeSeconds: 'github.pr.time_to_merge_seconds',
    commitChangedFiles: 'github.commit.changed_files',
};
export const factMetricKeySchema = z.enum(Object.values(FACT_METRIC_KEYS));
export const factMetricUnitSchema = z.enum(['lines', 'files', 'seconds', 'count']);
export const FACT_METRIC_UNITS = {
    [FACT_METRIC_KEYS.prAdditions]: 'lines',
    [FACT_METRIC_KEYS.prDeletions]: 'lines',
    [FACT_METRIC_KEYS.prChangedFiles]: 'files',
    [FACT_METRIC_KEYS.prCommentCount]: 'count',
    [FACT_METRIC_KEYS.prTimeToMergeSeconds]: 'seconds',
    [FACT_METRIC_KEYS.commitChangedFiles]: 'files',
};
export const factMetricSchema = z.object({
    key: factMetricKeySchema,
    value: z.number(),
    unit: factMetricUnitSchema,
});
//# sourceMappingURL=metrics.js.map
// SPDX-License-Identifier: Apache-2.0
import { resolve } from 'node:path';
import { StubInferenceBackend } from '@folklore/inference';
import { LocalFactStore } from '@folklore/local-db';
import { LocalFactRetriever, loadVectorIndex } from '@folklore/retrieval';
import { readProjectConfig } from './init.js';
export async function runQuery(options) {
    const config = readProjectConfig(options.cwd);
    const indexPath = resolve(options.cwd, config.indexPath ?? '.folklore/vector-index.json');
    const index = loadVectorIndex(indexPath);
    const store = new LocalFactStore(config.databaseUrl);
    const inference = new StubInferenceBackend();
    const userId = config.userId ?? config.orgId;
    const access = {
        audienceIds: ['local'],
        allowedSourceKinds: ['*'],
        maxSensitivity: 'confidential',
    };
    try {
        const retriever = new LocalFactRetriever({
            index,
            inference,
            loadMetadata: (orgId, factIds) => store.loadFactMetadata(orgId, factIds),
            loadBodies: (orgId, factIds) => store.loadFactBodies(orgId, factIds),
            resolveAudienceAccess: async () => access,
        });
        const hits = await retriever.search({
            orgId: config.orgId,
            userId,
            query: options.query,
            limit: options.limit ?? 5,
        });
        return {
            query: options.query,
            hits: hits.map((hit) => ({
                id: hit.id,
                kind: hit.kind,
                distance: hit.distance,
                snippet: hit.snippet,
            })),
        };
    }
    finally {
        await store.close();
    }
}
//# sourceMappingURL=query.js.map
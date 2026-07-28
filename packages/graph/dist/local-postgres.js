// SPDX-License-Identifier: Apache-2.0
import postgres from 'postgres';
export const LOCAL_AGE_SEARCH_PATH = 'ag_catalog, "$user", public';
export function createAgePostgresClient(url, max = 2) {
    return postgres(url, {
        max,
        connection: { search_path: LOCAL_AGE_SEARCH_PATH },
    });
}
//# sourceMappingURL=local-postgres.js.map
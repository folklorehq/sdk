// SPDX-License-Identifier: Apache-2.0
export interface CypherRunner {
  run(cypher: string, params?: Record<string, unknown>): Promise<void>;
  query<T extends Record<string, unknown>>(
    cypher: string,
    columns: string[],
    params?: Record<string, unknown>,
  ): Promise<T[]>;
}

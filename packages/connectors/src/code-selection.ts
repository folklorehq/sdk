// SPDX-License-Identifier: Apache-2.0
export type CodebaseRepositorySelection =
  | { mode: 'all' }
  | { mode: 'selected'; repositoryIds: readonly number[] };

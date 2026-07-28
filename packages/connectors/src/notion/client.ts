// SPDX-License-Identifier: Apache-2.0
import type { NotionPage } from './types.js';

export interface NotionApiClient {
  listPages(updatedSince?: string): Promise<NotionPage[]>;
}

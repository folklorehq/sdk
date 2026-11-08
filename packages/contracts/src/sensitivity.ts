// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// content-free sensitivity label. A bare enum only: never carries a reason, snippet,
// or matched keyword, so it does not smuggle content across the trust boundary.
export const sensitivityLevelSchema = z.enum([
  'public',
  'team_scoped',
  'restricted',
  'confidential',
]);
export type SensitivityLevel = z.infer<typeof sensitivityLevelSchema>;

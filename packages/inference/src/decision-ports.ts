// SPDX-License-Identifier: Apache-2.0
import type { DecisionSite } from '@folklore/contracts';

export type JevStateValue =
  | string
  | number
  | boolean
  | readonly JevStateValue[]
  | { readonly [key: string]: JevStateValue };

export type JevInstructions = string | Readonly<Record<string, string>>;

export interface NoulQuestion {
  readonly type: 'noul';
  readonly instructions: JevInstructions;
  readonly criteria?: { readonly true: string; readonly false: string };
}

export interface ChoiceQuestion {
  readonly type: 'choice';
  readonly instructions: JevInstructions;
  readonly criteria: Readonly<Record<string, string>>;
}

export type DecisionQuestion = NoulQuestion | ChoiceQuestion;

/** One state, the question sets of one or more sites; question names are unique across sets. */
export interface DecisionRequest {
  readonly sites: readonly [DecisionSite, ...DecisionSite[]];
  readonly state: Readonly<Record<string, JevStateValue>>;
  readonly questions: Readonly<Record<string, DecisionQuestion>>;
}

export type DecisionAnswer =
  | { readonly type: 'noul'; readonly pYes: number }
  | {
      readonly type: 'choice';
      readonly choice: string;
      readonly probabilities: Readonly<Record<string, number>>;
    };

export interface DecisionResult {
  readonly model: string;
  readonly answers: Readonly<Record<string, DecisionAnswer>>;
}

export interface DecideOptions {
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly outcome?: 'ok' | 'shadow';
}

/** The process-wide provider; only a tenant's policy-bound inference calls it. */
export interface DecisionModel {
  readonly model: string;
  decide(orgId: string, request: DecisionRequest, options?: DecideOptions): Promise<DecisionResult>;
}

/** A tenant's decisions: the org is bound at construction and every call is admitted. */
export interface TenantDecisionPort {
  readonly orgId: string;
  readonly model: string;
  decide(request: DecisionRequest, options?: DecideOptions): Promise<DecisionResult>;
}

// SPDX-License-Identifier: Apache-2.0
export interface LinearRef {
  readonly id: string;
}

export interface LinearPageInfo {
  readonly hasNextPage: boolean;
  readonly endCursor: string | null;
}

export interface LinearPage<T> {
  readonly nodes: readonly T[];
  readonly pageInfo: LinearPageInfo;
}

export interface LinearHistoryNode {
  readonly id: string;
  readonly createdAt: string;
  readonly actorId: string | null;
  readonly fromStateId: string | null;
  readonly toStateId: string | null;
  readonly toState: { readonly type: string } | null;
  readonly fromAssigneeId: string | null;
  readonly toAssigneeId: string | null;
  readonly fromPriority: number | null;
  readonly toPriority: number | null;
  readonly fromProjectId: string | null;
  readonly toProjectId: string | null;
  readonly fromCycleId: string | null;
  readonly toCycleId: string | null;
  readonly fromParentId: string | null;
  readonly toParentId: string | null;
  readonly fromEstimate: number | null;
  readonly toEstimate: number | null;
  readonly fromDueDate: string | null;
  readonly toDueDate: string | null;
  readonly addedLabelIds: readonly string[] | null;
  readonly removedLabelIds: readonly string[] | null;
  readonly fromTeamId: string | null;
  readonly toTeamId: string | null;
  readonly fromTitle: string | null;
  readonly toTitle: string | null;
  readonly updatedDescription: boolean | null;
}

export interface LinearIssueNode {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt: string | null;
  readonly team: LinearRef;
  readonly creator: LinearRef | null;
  readonly project: LinearRef | null;
  readonly cycle: LinearRef | null;
  readonly history: LinearPage<LinearHistoryNode>;
}

export interface LinearCommentNode {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly editedAt: string | null;
  readonly resolvedAt: string | null;
  readonly user: LinearRef | null;
  readonly botActor: { readonly type: string } | null;
  readonly issue: {
    readonly id: string;
    readonly identifier: string;
    readonly team: LinearRef;
  } | null;
}

export interface LinearProjectNode {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly content: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly canceledAt: string | null;
  readonly creator: LinearRef | null;
}

export interface LinearTeamNode {
  readonly id: string;
  readonly name: string;
  readonly private: boolean;
}

export interface LinearCycleNode {
  readonly id: string;
  readonly number: number;
  readonly name: string | null;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
  readonly team: LinearRef;
}

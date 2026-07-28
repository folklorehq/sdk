// SPDX-License-Identifier: Apache-2.0
export interface LinearUser {
  id: string;
  name: string;
  email?: string;
}

export interface LinearState {
  name: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'cancelled';
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
}

export interface LinearLabel {
  id: string;
  name: string;
  color: string;
}

export interface LinearIssue {
  id: string;
  number: number;
  title: string;
  description?: string;
  priority: number;
  state: LinearState;
  assignee?: LinearUser;
  team: LinearTeam;
  labels?: LinearLabel[];
  createdAt: string;
  updatedAt: string;
}

export interface LinearComment {
  id: string;
  body: string;
  issue: { id: string; number: number; team: LinearTeam };
  user: LinearUser;
  createdAt: string;
}

export interface LinearIssueEvent {
  action: 'create' | 'update';
  data: LinearIssue;
  type: 'Issue';
  createdAt: string;
  organizationId: string;
}

export interface LinearCommentEvent {
  action: 'create';
  data: LinearComment;
  type: 'Comment';
  createdAt: string;
  organizationId: string;
}

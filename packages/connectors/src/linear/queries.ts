// SPDX-License-Identifier: Apache-2.0
const HISTORY_FIELDS = `id createdAt actorId fromStateId toStateId toState { type } fromAssigneeId toAssigneeId
  fromPriority toPriority fromProjectId toProjectId fromCycleId toCycleId fromParentId toParentId
  fromEstimate toEstimate fromDueDate toDueDate addedLabelIds removedLabelIds fromTeamId toTeamId
  fromTitle toTitle updatedDescription`;

export const LINEAR_ISSUES_QUERY = `query FolkloreLinearIssues($gt: DateTimeOrDuration!, $lte: DateTimeOrDuration!, $after: String) {
  issues(first: 25, after: $after, orderBy: updatedAt, includeArchived: true, filter: { updatedAt: { gt: $gt, lte: $lte } }) {
    nodes { id identifier title description createdAt updatedAt archivedAt team { id } creator { id } project { id } cycle { id }
      history(first: 50) { nodes { ${HISTORY_FIELDS} } pageInfo { hasNextPage endCursor } } }
    pageInfo { hasNextPage endCursor } } }`;

export const LINEAR_ISSUE_HISTORY_QUERY = `query FolkloreLinearIssueHistory($id: String!, $after: String) {
  issue(id: $id) { history(first: 50, after: $after) { nodes { ${HISTORY_FIELDS} } pageInfo { hasNextPage endCursor } } } }`;

export const LINEAR_COMMENTS_QUERY = `query FolkloreLinearComments($gt: DateTimeOrDuration!, $lte: DateTimeOrDuration!, $after: String) {
  comments(first: 100, after: $after, orderBy: updatedAt, filter: { updatedAt: { gt: $gt, lte: $lte } }) {
    nodes { id body createdAt updatedAt editedAt resolvedAt user { id } botActor { type } issue { id identifier team { id } } }
    pageInfo { hasNextPage endCursor } } }`;

export const LINEAR_PROJECTS_QUERY = `query FolkloreLinearProjects($gt: DateTimeOrDuration!, $lte: DateTimeOrDuration!, $after: String) {
  projects(first: 50, after: $after, orderBy: updatedAt, includeArchived: true, filter: { updatedAt: { gt: $gt, lte: $lte } }) {
    nodes { id name description content createdAt updatedAt completedAt canceledAt creator { id } }
    pageInfo { hasNextPage endCursor } } }`;

export const LINEAR_CYCLES_QUERY = `query FolkloreLinearCycles($gt: DateTimeOrDuration!, $lte: DateTimeOrDuration!, $after: String) {
  cycles(first: 50, after: $after, orderBy: updatedAt, includeArchived: true, filter: { updatedAt: { gt: $gt, lte: $lte } }) {
    nodes { id number name description createdAt updatedAt completedAt team { id } }
    pageInfo { hasNextPage endCursor } } }`;

export const LINEAR_TEAMS_QUERY = `query FolkloreLinearTeams($after: String) {
  teams(first: 50, after: $after) {
    nodes { id name private }
    pageInfo { hasNextPage endCursor } } }`;

// SPDX-License-Identifier: Apache-2.0
import { FakeLinearApi } from './FakeLinearApi.js';
import {
  commentNode,
  cycleNode,
  daysAgo,
  historyNode,
  issueNode,
  page,
  projectNode,
} from '../../fixtures/linear.js';

const OVERFLOW_CURSOR = '0';

export function overflowWorld(): FakeLinearApi {
  const fake = new FakeLinearApi();
  fake.issueNodes = [
    issueNode({
      id: 'issue-a',
      identifier: 'ENG-42',
      description: 'Auth is broken. See https://linear.app/acme/issue/ENG-43/refactor-login',
      createdAt: daysAgo(5),
      updatedAt: daysAgo(1),
      history: page(
        [
          historyNode({
            id: 'h-state',
            createdAt: daysAgo(4),
            fromStateId: 's1',
            toStateId: 's2',
            toState: { type: 'started' },
          }),
          historyNode({ id: 'h-assignee', createdAt: daysAgo(3), toAssigneeId: 'user-9' }),
        ],
        OVERFLOW_CURSOR,
      ),
    }),
    issueNode({
      id: 'issue-b',
      identifier: 'ENG-44',
      description: null,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(6),
      project: null,
      cycle: null,
    }),
    issueNode({
      id: 'issue-c',
      identifier: 'ENG-45',
      createdAt: daysAgo(8),
      updatedAt: daysAgo(2),
      archivedAt: daysAgo(2),
    }),
  ];
  fake.historyOverflow.set('issue-a', [
    historyNode({ id: 'h-late-1', createdAt: daysAgo(2), toAssigneeId: 'user-c' }),
    historyNode({ id: 'h-late-2', createdAt: daysAgo(1), fromPriority: 0, toPriority: 2 }),
    historyNode({ id: 'h-late-3', createdAt: daysAgo(1), fromTitle: 'Fix auth', toTitle: 'Fix' }),
  ]);
  fake.commentNodes = [
    commentNode({ id: 'c-plain', createdAt: daysAgo(4), updatedAt: daysAgo(4) }),
    commentNode({
      id: 'c-edited',
      createdAt: daysAgo(5),
      editedAt: daysAgo(2),
      updatedAt: daysAgo(2),
    }),
    commentNode({
      id: 'c-resolved',
      createdAt: daysAgo(5),
      resolvedAt: daysAgo(1),
      updatedAt: daysAgo(1),
    }),
  ];
  fake.projectNodes = [
    projectNode({
      id: 'project-1',
      createdAt: daysAgo(30),
      updatedAt: daysAgo(1),
      completedAt: daysAgo(1),
    }),
    projectNode({
      id: 'project-2',
      createdAt: daysAgo(20),
      updatedAt: daysAgo(2),
      canceledAt: daysAgo(2),
    }),
  ];
  fake.cycleNodes = [
    cycleNode({
      id: 'cycle-1',
      number: 7,
      createdAt: daysAgo(14),
      updatedAt: daysAgo(1),
      completedAt: daysAgo(1),
    }),
  ];
  return fake;
}

export function issuesWorld(count: number, pageSize?: number): FakeLinearApi {
  const fake = new FakeLinearApi(pageSize);
  fake.issueNodes = Array.from({ length: count }, (_, index) =>
    issueNode({ id: `issue-${index}`, identifier: `ENG-${100 + index}` }),
  );
  return fake;
}

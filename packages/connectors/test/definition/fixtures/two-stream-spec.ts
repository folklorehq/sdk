// SPDX-License-Identifier: Apache-2.0
import type { ConnectorSpec } from '@folklore/contracts';
import { spec, stream } from './streams.js';

const RECORD_MAX = {
  source: 'record_max',
  pointer: '/updatedAt',
  param: 'since',
  in: 'query',
  format: 'iso8601',
  onGone: 'fail',
  dropsParams: [],
};

const ALWAYS_RESTRICTED = { restrictedScope: { mode: 'always' }, namesPointers: [] };

export const twoStreamSpec: ConnectorSpec = spec(
  stream({
    name: 'projects',
    request: { path: '/v1/projects' },
    cursor: RECORD_MAX,
    mapping: {
      shape: 'item',
      containerLabel: 'unknown',
      idPointer: '/id',
      titlePointer: '/name',
      bodyPointer: null,
      authorIdPointer: '/author',
      createdAtPointer: '/createdAt',
      updatedAtPointer: '/updatedAt',
      status: null,
      sensitivity: ALWAYS_RESTRICTED,
    },
  }),
  stream({
    name: 'tasks',
    request: { path: '/v1/projects/{parent.pid}/tasks' },
    paginator: { type: 'cursor', param: 'pageToken', in: 'query', nextPointer: '/next' },
    cursor: RECORD_MAX,
    parent: { stream: 'projects', bind: { pid: '/id' } },
    mapping: {
      shape: 'comment',
      parentIdPointer: '/id',
      idPointer: '/id',
      bodyPointer: '/text',
      authorIdPointer: '/author',
      createdAtPointer: '/createdAt',
      sensitivity: ALWAYS_RESTRICTED,
    },
  }),
);

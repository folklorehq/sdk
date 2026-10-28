// SPDX-License-Identifier: Apache-2.0
import type { TransportRequest } from '@folklore/core';
import type { FixtureReply, FixtureRoute } from './FixtureTransport.js';

export interface WorldProject {
  id: string;
  updatedAt: string;
}

export interface WorldTask {
  id: string;
  updatedAt: string;
}

const TASKS_PATH = /^\/v1\/projects\/([^/]+)\/tasks$/;
const PAGE_PREFIX = 'page-';

export class TwoStreamWorld {
  projects: WorldProject[] = [];
  readonly tasks = new Map<string, WorldTask[]>();
  readonly route: FixtureRoute = (request) => this.serve(request);

  addProject(project: WorldProject, tasks: WorldTask[]): void {
    this.projects.push(project);
    this.tasks.set(project.id, tasks);
  }

  insertProjectFirst(project: WorldProject, tasks: WorldTask[]): void {
    this.projects.unshift(project);
    this.tasks.set(project.id, tasks);
  }

  deleteProject(id: string): void {
    this.projects = this.projects.filter((project) => project.id !== id);
    this.tasks.delete(id);
  }

  touchEverything(updatedAt: string): void {
    for (const project of this.projects) project.updatedAt = updatedAt;
    for (const tasks of this.tasks.values()) for (const task of tasks) task.updatedAt = updatedAt;
  }

  private serve(request: TransportRequest): FixtureReply {
    const path = request.url.pathname;
    if (path === '/v1/projects') {
      return { body: { items: this.projects.map((project) => this.projectRecord(project)) } };
    }
    const match = TASKS_PATH.exec(path);
    if (!match) throw new Error(`unexpected path ${path}`);
    return this.taskPage(decodeURIComponent(match[1]!), request.url.searchParams.get('pageToken'));
  }

  private taskPage(projectId: string, token: string | null): FixtureReply {
    const tasks = this.tasks.get(projectId) ?? [];
    const index = token === null ? 0 : Number(token.slice(PAGE_PREFIX.length)) - 1;
    const task = tasks[index];
    const next = index + 1 < tasks.length ? `${PAGE_PREFIX}${index + 2}` : undefined;
    return { body: { items: task ? [this.taskRecord(task)] : [], ...(next ? { next } : {}) } };
  }

  private projectRecord(project: WorldProject) {
    return {
      id: project.id,
      name: `Project ${project.id}`,
      author: 'u1',
      createdAt: project.updatedAt,
      updatedAt: project.updatedAt,
    };
  }

  private taskRecord(task: WorldTask) {
    return {
      id: task.id,
      text: `Task ${task.id}`,
      author: 'u2',
      createdAt: task.updatedAt,
      updatedAt: task.updatedAt,
    };
  }
}

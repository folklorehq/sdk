// SPDX-License-Identifier: Apache-2.0
import type { ConnectorTransport, TransportRequest, TransportResponse } from '@folklore/core';

export interface FixtureReply {
  readonly status?: number;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  readonly rawBody?: string;
}

export type FixtureRoute = (request: TransportRequest) => FixtureReply;

export class FixtureTransport implements ConnectorTransport {
  readonly requests: TransportRequest[] = [];
  private readonly queue: FixtureReply[];
  private readonly route: FixtureRoute | null;

  constructor(replies: readonly FixtureReply[] | FixtureRoute) {
    this.queue = typeof replies === 'function' ? [] : [...replies];
    this.route = typeof replies === 'function' ? replies : null;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    this.requests.push(request);
    const reply = this.route ? this.route(request) : this.queue.shift();
    if (!reply) throw new Error('fixture transport has no reply left');
    return new FixtureResponse(reply);
  }
}

class FixtureResponse implements TransportResponse {
  readonly status: number;

  constructor(private readonly reply: FixtureReply) {
    this.status = reply.status ?? 200;
  }

  header(name: string): string | null {
    const match = Object.entries(this.reply.headers ?? {}).find(
      ([key]) => key.toLowerCase() === name.toLowerCase(),
    );
    return match ? match[1] : null;
  }

  async json(): Promise<unknown> {
    if (this.reply.rawBody !== undefined) return JSON.parse(this.reply.rawBody) as unknown;
    return this.reply.body ?? {};
  }
}

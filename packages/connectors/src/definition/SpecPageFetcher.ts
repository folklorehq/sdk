// SPDX-License-Identifier: Apache-2.0
import {
  SPEC_MAX_RECORDS_PER_PAGE,
  type ConnectorManifest,
  type StreamSpec,
} from '@folklore/contracts';
import type { ConnectorTransport, TransportRequest, TransportResponse } from '@folklore/core';
import { ConnectorSpecError, TransportStatusError, isAppError } from '@folklore/errors';
import { resolveJsonPointer } from '@folklore/utils';
import { cursorText } from './cursor-values.js';
import { nextPage, type PageOutcome } from './paginators.js';
import {
  buildFollowRequest,
  buildSpecRequest,
  type PagingParam,
  type TemplateValues,
} from './request-builder.js';
import type { ShapeAdapters } from './shape-adapters.js';
import { assertSpecUrl, parseSpecUrl } from './spec-egress.js';

export interface SpecRunEnv {
  readonly kind: string;
  readonly manifest: ConnectorManifest;
  readonly transport: ConnectorTransport;
  readonly shapes: ShapeAdapters;
  readonly externalTenantId: string | null;
  readonly since: string | undefined;
  readonly now: () => Date;
  readonly guard: <T>(operation: string, run: () => Promise<T>) => Promise<T>;
}

interface PageRequest {
  readonly token: string | null;
  readonly cursor: string | null;
  readonly parent: Readonly<Record<string, string>>;
  readonly window: { readonly s: string; readonly e: string };
}

export interface FetchedPage {
  readonly records: readonly unknown[];
  readonly next: PageOutcome['next'];
  readonly finalValue: string | null;
}

interface Exchange {
  readonly response: TransportResponse;
  readonly body: unknown;
}

export class SpecPageFetcher {
  private readonly specOrigin: string;

  constructor(
    private readonly stream: StreamSpec,
    private readonly env: SpecRunEnv,
  ) {
    this.specOrigin = `https://${stream.request.host}`;
  }

  async fetch(input: PageRequest): Promise<FetchedPage> {
    const request = this.request(input);
    const { response, body } = await this.env.guard(this.stream.name, () => this.exchange(request));
    const records = this.records(body);
    const outcome = nextPage(
      this.stream.paginator,
      { body, header: (name) => response.header(name) },
      records.length,
      input.token,
    );
    return { records, next: outcome.next, finalValue: this.finalValue(body) };
  }

  private request(input: PageRequest): TransportRequest {
    const followsUrl = this.followsUrl();
    const values: TemplateValues = {
      cursor: input.cursor,
      page: followsUrl ? null : input.token,
      window: { start: input.window.s, end: input.window.e },
      parent: input.parent,
      externalTenantId: this.env.externalTenantId,
    };
    if (followsUrl && input.token !== null) {
      const url = parseSpecUrl(input.token);
      assertSpecUrl(url, this.env.manifest, this.specOrigin);
      return buildFollowRequest(this.stream, url, values);
    }
    const request = buildSpecRequest(this.stream, values, this.paging(input.token));
    assertSpecUrl(request.url, this.env.manifest, null);
    return request;
  }

  private followsUrl(): boolean {
    return (
      this.stream.paginator.type === 'next_url' || this.stream.paginator.type === 'link_header'
    );
  }

  private paging(token: string | null): PagingParam | null {
    const paginator = this.stream.paginator;
    switch (paginator.type) {
      case 'page_number':
        return {
          param: paginator.param,
          in: paginator.in,
          value: token ?? String(paginator.start),
        };
      case 'offset':
        return { param: paginator.param, in: paginator.in, value: token ?? '0' };
      case 'cursor':
        return token === null ? null : { param: paginator.param, in: paginator.in, value: token };
      default:
        return null;
    }
  }

  private async exchange(request: TransportRequest): Promise<Exchange> {
    const response = await this.send(request);
    if (response.status < 200 || response.status >= 300) {
      throw new TransportStatusError(response.status);
    }
    return { response, body: await this.readJson(response) };
  }

  private async send(request: TransportRequest): Promise<TransportResponse> {
    try {
      return await this.env.transport.send(request);
    } catch (error) {
      throw isAppError(error) ? error : new ConnectorSpecError('egress_request_failed');
    }
  }

  private async readJson(response: TransportResponse): Promise<unknown> {
    try {
      return await response.json();
    } catch (error) {
      throw isAppError(error) ? error : new ConnectorSpecError('spec_response_not_json');
    }
  }

  private records(body: unknown): readonly unknown[] {
    const selected = resolveJsonPointer(body, this.stream.recordSelector);
    if (selected === undefined || selected === null) return [];
    if (!Array.isArray(selected)) throw new ConnectorSpecError('spec_record_selector_invalid');
    if (selected.length > SPEC_MAX_RECORDS_PER_PAGE) {
      throw new ConnectorSpecError('spec_page_too_large');
    }
    return selected;
  }

  private finalValue(body: unknown): string | null {
    const cursor = this.stream.cursor;
    return cursor?.source === 'response_final'
      ? cursorText(resolveJsonPointer(body, cursor.pointer))
      : null;
  }
}

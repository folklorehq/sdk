// SPDX-License-Identifier: Apache-2.0
import {
  CUSTOM_CONTAINER_LABEL,
  CUSTOM_MAX_STREAMS,
  type CustomDefinition,
  type CustomViolationCode,
} from './custom-definition.js';
import { SPEC_TEMPLATE_TOKEN } from '../stream-spec.js';
import {
  PAGING_VERB_EXEMPT_NAMES,
  hasNonReadToken,
  hasReadVerb,
  hasWriteVerb,
  hasWriteVerbInParam,
  isFramingHeader,
  isMethodOverrideHeader,
  isMethodOverrideParam,
} from './read-semantics.js';

type ApiSource = Extract<CustomDefinition['source'], { readonly type: 'api' }>;
type CustomStream = ApiSource['spec']['streams'][number];
type PostRead = ApiSource['postReads'][number];
type CustomMapping = NonNullable<CustomStream['mapping']>;

const TENANT_TOKEN = '{connection.externalTenantId}';
const ALLOWED_SHAPES: ReadonlySet<string> = new Set(['item', 'comment']);

// Template tokens are filled from record values or the runtime, so they never name an action.
const withoutTemplateTokens = (value: string): string => value.replace(SPEC_TEMPLATE_TOKEN, ' ');

class CustomDefinitionRules {
  constructor(private readonly definition: CustomDefinition) {}

  violations(): CustomViolationCode[] {
    const checks: ReadonlyArray<readonly [CustomViolationCode, () => boolean]> = [
      ['custom_spec_kind_mismatch', () => this.specKindMismatch()],
      ['custom_identity_forbidden', () => this.identityForbidden()],
      ['custom_host_outside_api', () => this.hostOutsideApi()],
      ['custom_auth_mode_refused', () => this.authModeRefused()],
      ['custom_tenant_token_refused', () => this.tenantTokenRefused()],
      ['custom_write_verb', () => this.writeVerb()],
      ['custom_post_without_read_decision', () => this.postWithoutReadDecision()],
      ['custom_post_read_decision_dangling', () => this.postReadDecisionDangling()],
      ['custom_shape_refused', () => this.shapeRefused()],
      ['custom_label_refused', () => this.labelRefused()],
      ['custom_stream_count', () => this.streamCount()],
      ['custom_exchange_host_mismatch', () => this.exchangeHostMismatch()],
      ['custom_export_delivery_unavailable', () => this.exportDeliveryUnavailable()],
      ['custom_export_csv_mismatch', () => this.exportCsvMismatch()],
      ['custom_hosts_duplicate_docs', () => this.hostsDuplicateDocs()],
      ['custom_deletion_stream_invalid', () => this.deletionStreamInvalid()],
      ['custom_method_override', () => this.methodOverride()],
      ['custom_framing_header', () => this.framingHeader()],
      ['custom_path_encoded', () => this.pathEncoded()],
      ['custom_credential_collision', () => this.credentialCollision()],
    ];
    return checks.filter(([, violated]) => violated()).map(([code]) => code);
  }

  private get apiSource(): ApiSource | null {
    return this.definition.source.type === 'api' ? this.definition.source : null;
  }

  private get streams(): readonly CustomStream[] {
    return this.apiSource?.spec.streams ?? [];
  }

  private get postReads(): readonly PostRead[] {
    return this.apiSource?.postReads ?? [];
  }

  private get mappings(): readonly CustomMapping[] {
    const source = this.definition.source;
    const mappings =
      source.type === 'api'
        ? source.spec.streams.map((stream) => stream.mapping)
        : [source.export.mapping];
    return mappings.filter((mapping): mapping is CustomMapping => mapping !== null);
  }

  private specKindMismatch(): boolean {
    return this.apiSource !== null && this.apiSource.spec.kind !== this.definition.slot;
  }

  private identityForbidden(): boolean {
    return this.apiSource !== null && this.apiSource.spec.identity !== null;
  }

  private hostOutsideApi(): boolean {
    return this.streams.some((stream) => stream.request.host !== this.definition.hosts.api);
  }

  private authModeRefused(): boolean {
    return this.streams.some(
      (stream) =>
        stream.auth === 'raw_token' || (stream.auth === 'bearer' && this.definition.auth === null),
    );
  }

  private tenantTokenRefused(): boolean {
    return this.streams.some((stream) => JSON.stringify(stream.request).includes(TENANT_TOKEN));
  }

  private writeVerb(): boolean {
    return (
      this.streams.some((stream) => this.requestHasWriteVerb(stream)) ||
      this.otherPaths().some((path) => hasWriteVerb(withoutTemplateTokens(path)))
    );
  }

  private requestHasWriteVerb(stream: CustomStream): boolean {
    const { path, query = {}, body = {}, headers = {} } = stream.request;
    const named = [...Object.entries(query), ...Object.entries(body), ...Object.entries(headers)];
    return (
      named.some(([name, value]) => hasWriteVerbInParam(name, value)) ||
      this.verbCheckedPagingNames(stream).some((name) => hasWriteVerbInParam(name, '')) ||
      [path, ...named.map(([, value]) => value)].some((value) =>
        hasWriteVerb(withoutTemplateTokens(value)),
      )
    );
  }

  private otherPaths(): string[] {
    const detailPaths = (this.apiSource?.deletion ?? []).flatMap((entry) =>
      entry.mode === 'detail_probe' ? [entry.detailPath] : [],
    );
    const source = this.definition.source;
    const deliveryPath =
      source.type === 'export' && source.export.delivery.type === 'https_get'
        ? [source.export.delivery.path]
        : [];
    return [...detailPaths, ...deliveryPath];
  }

  private postWithoutReadDecision(): boolean {
    return this.streams.some(
      (stream, index) =>
        stream.request.method === 'POST' &&
        !this.postReads.some((decision) => decision.stream === index),
    );
  }

  private postReadDecisionDangling(): boolean {
    return this.postReads.some((decision) => !this.isRecordedRead(decision));
  }

  private isRecordedRead(decision: PostRead): boolean {
    const stream = this.streams[decision.stream];
    if (stream === undefined || stream.request.method !== 'POST') return false;
    const path = withoutTemplateTokens(stream.request.path);
    if (hasNonReadToken(path)) return false;
    if (decision.basis === 'openapi_operation') return this.definition.origin === 'openapi';
    return hasReadVerb(path.split('/').filter(Boolean).at(-1) ?? '');
  }

  private shapeRefused(): boolean {
    return this.mappings.some((mapping) => !ALLOWED_SHAPES.has(mapping.shape));
  }

  private labelRefused(): boolean {
    return this.mappings.some((mapping) => {
      const label: string =
        mapping.shape === 'item' ? mapping.containerLabel : CUSTOM_CONTAINER_LABEL;
      return label !== CUSTOM_CONTAINER_LABEL;
    });
  }

  private streamCount(): boolean {
    return this.streams.length > CUSTOM_MAX_STREAMS;
  }

  private exchangeHostMismatch(): boolean {
    const { token, login } = this.definition.hosts;
    const mode = this.definition.auth?.mode;
    return (
      (token !== null) !== (mode === 'oauth_client_credentials') ||
      (login !== null && mode !== 'form_login') ||
      (token !== null && login !== null)
    );
  }

  private exportDeliveryUnavailable(): boolean {
    const source = this.definition.source;
    return source.type === 'export' && source.export.delivery.type === 'email_alias';
  }

  private exportCsvMismatch(): boolean {
    const source = this.definition.source;
    return (
      source.type === 'export' && (source.export.format === 'csv') !== (source.export.csv !== null)
    );
  }

  private hostsDuplicateDocs(): boolean {
    const { api, token, login, docs } = this.definition.hosts;
    return docs !== null && [api, token, login].includes(docs);
  }

  private methodOverride(): boolean {
    return this.streams.some((stream) => {
      const { query = {}, body = {}, headers = {} } = stream.request;
      const names = [...Object.keys(query), ...Object.keys(body), ...this.pagingNames(stream)];
      return Object.keys(headers).some(isMethodOverrideHeader) || names.some(isMethodOverrideParam);
    });
  }

  private framingHeader(): boolean {
    return this.streams.some(({ request }) =>
      Object.keys(request.headers ?? {}).some(isFramingHeader),
    );
  }

  private pathEncoded(): boolean {
    return this.streams.some((stream) => stream.request.path.includes('%'));
  }

  private credentialCollision(): boolean {
    const auth = this.definition.auth;
    if (auth?.mode === 'api_key_query') {
      return this.streams.some((stream) =>
        this.queryNames(stream).includes(auth.param.toLowerCase()),
      );
    }
    if (auth?.mode === 'api_key_header') {
      const header = auth.header.toLowerCase();
      return this.streams.some(({ request }) =>
        Object.keys(request.headers ?? {}).some((name) => name.toLowerCase() === header),
      );
    }
    return false;
  }

  private queryNames(stream: CustomStream): string[] {
    return [...Object.keys(stream.request.query ?? {}), ...this.pagingNames(stream)].map((name) =>
      name.toLowerCase(),
    );
  }

  // The main paging and cursor parameters may use the exempt names; the limit and dropped names get the full check.
  private verbCheckedPagingNames({ paginator, cursor }: CustomStream): string[] {
    const main = [
      ...('param' in paginator ? [paginator.param] : []),
      ...(cursor ? [cursor.param] : []),
    ];
    const others = [
      ...('limitParam' in paginator ? [paginator.limitParam] : []),
      ...(cursor?.dropsParams ?? []),
    ];
    return [...main.filter((name) => !PAGING_VERB_EXEMPT_NAMES.has(name)), ...others];
  }

  private pagingNames({ paginator, cursor }: CustomStream): string[] {
    return [
      ...('param' in paginator ? [paginator.param] : []),
      ...('limitParam' in paginator ? [paginator.limitParam] : []),
      ...(cursor ? [cursor.param, ...cursor.dropsParams] : []),
    ];
  }

  private deletionStreamInvalid(): boolean {
    const seen = new Set<number>();
    return (this.apiSource?.deletion ?? []).some((entry) => {
      const invalid =
        seen.has(entry.stream) || this.streams[entry.stream]?.mapping?.shape !== 'item';
      seen.add(entry.stream);
      return invalid;
    });
  }
}

export function customDefinitionViolations(definition: CustomDefinition): CustomViolationCode[] {
  return new CustomDefinitionRules(definition).violations();
}

// SPDX-License-Identifier: Apache-2.0
export interface TransportRequest {
  readonly method: 'GET' | 'POST';
  readonly url: URL;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string | null;
  readonly auth: 'bearer' | 'raw_token' | 'none';
  readonly stream: string;
}

export interface TransportResponse {
  readonly status: number;
  header(name: string): string | null;
  json(): Promise<unknown>;
}

/** Bound to one kind, one org and one token at construction; the interpreter never sees the token. */
export interface ConnectorTransport {
  send(request: TransportRequest): Promise<TransportResponse>;
}

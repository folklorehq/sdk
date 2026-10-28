// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  AppError,
  ConnectorSpecError,
  CustomConnectorError,
  TransportStatusError,
} from '../src/index.js';

describe('ConnectorSpecError', () => {
  it('uses the code as the message and carries no cause', () => {
    const err = new ConnectorSpecError('egress_host_refused');
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('egress_host_refused');
    expect(err.code).toBe('egress_host_refused');
    expect(err.category).toBe('internal');
    expect(err.cause).toBeUndefined();
    expect(err.context).toBeUndefined();
    expect(err.toTelemetry().error_type).toBe('egress_host_refused');
  });

  it.each(['spec_invalid', 'spec_path_invalid', 'spec_manifest_missing'] as const)(
    'carries %s as a code-only error',
    (code) => {
      const err = new ConnectorSpecError(code);
      expect(err.code).toBe(code);
      expect(err.message).toBe(code);
      expect(err.cause).toBeUndefined();
      expect(err.context).toBeUndefined();
    },
  );

  it('can name a header but nothing else', () => {
    const err = new ConnectorSpecError('header_value_refused', { header: 'X-Trace' });
    expect(err.context).toEqual({ header: 'X-Trace' });
    expect(err.message).toBe('header_value_refused');
  });
});

describe('TransportStatusError', () => {
  it('carries the status and nothing else', () => {
    const err = new TransportStatusError(429);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(429);
    expect(err.code).toBe('connector_http_429');
    expect(err.message).toBe('connector_http_429');
    expect(err.category).toBe('external');
    expect(err.httpStatus).toBe(502);
    expect(err.context).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });
});

describe('CustomConnectorError', () => {
  it.each([
    'custom_definition_invalid',
    'custom_revision_identity_changed',
    'custom_host_refused',
    'egress_grant_unsupported',
    'custom_mass_deletion_refused',
  ] as const)('carries %s as a code-only error', (code) => {
    const err = new CustomConnectorError(code);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe(code);
    expect(err.message).toBe(code);
    expect(err.category).toBe('internal');
    expect(err.cause).toBeUndefined();
    expect(err.context).toBeUndefined();
    expect(err.toTelemetry().error_type).toBe(code);
  });
});

// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  AGENT_DATABASE_AUTH_ENV,
  AGENT_DATABASE_AUTH_SCRAM,
  AGENT_DATABASE_CREDENTIAL_SSM_PATH_ENV,
  generateAgentDatabaseCredential,
  parseAgentDatabaseCredential,
  scramSha256Verifier,
  serializeAgentDatabaseCredential,
  type AgentDatabaseAuth,
} from '../src/index.js';

const VERIFIER_PATTERN =
  /^SCRAM-SHA-256\$[0-9]{4,7}:[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=:[A-Za-z0-9+/]{43}=$/;
const PASSWORD = 'a'.repeat(64);
const FIXED_SALT = Buffer.from(Array.from({ length: 16 }, (_, index) => index));
const ITERATIONS = 4096;
// Computed independently with Python hashlib.pbkdf2_hmac + hmac per RFC 5802/7677.
const KNOWN_VERIFIER =
  'SCRAM-SHA-256$4096:AAECAwQFBgcICQoLDA0ODw==$HdrLQKlGCF6BYVPVDo1W42SrzG2w7U3LkMEWU/Rhlxs=:hKfY4QZft7Vi1wQiz9MvToq8CBi2+Wb1+1VTNTnG3w8=';
const KNOWN_VERIFIER_8192 =
  'SCRAM-SHA-256$8192:AAECAwQFBgcICQoLDA0ODw==$SiXR4sgEsY/vIINGHNoou6ZwhPkCqz6c1VLdldzRJd0=:54y4UN5/p5o/cdsfje8QgpG4UFvYaoR6oPcoQfItuz0=';
const MAX_ITERATIONS = 9_999_999;
const MAX_ITERATIONS_TIMEOUT_MS = 60_000;
const INVALID = 'agent_database_credential_invalid';
const SCRAM_PARAMETERS_INVALID = 'scram_verifier_parameters_invalid';
const MALFORMED_PASSWORDS: readonly (readonly [string, string])[] = [
  ['an empty password', ''],
  ['a short password', 'oops'],
  ['an uppercase password', 'A'.repeat(64)],
  ['a 63-character password', 'c'.repeat(63)],
  ['a non-ASCII password', 'é'.repeat(64)],
];

function thrownMessage(action: () => unknown): string {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the action to throw');
}

describe('scramSha256Verifier', () => {
  it('produces a verifier in the shape the tenant DB accepts', () => {
    expect(scramSha256Verifier(PASSWORD)).toMatch(VERIFIER_PATTERN);
  });

  it('matches an independently computed known-answer vector', () => {
    expect(scramSha256Verifier(PASSWORD, FIXED_SALT, ITERATIONS)).toBe(KNOWN_VERIFIER);
  });

  it('matches an independently computed vector at a non-default iteration count', () => {
    expect(scramSha256Verifier(PASSWORD, FIXED_SALT, 8192)).toBe(KNOWN_VERIFIER_8192);
  });

  it(
    'accepts the largest iteration count the tenant DB admits',
    () => {
      expect(scramSha256Verifier(PASSWORD, FIXED_SALT, MAX_ITERATIONS)).toMatch(VERIFIER_PATTERN);
    },
    MAX_ITERATIONS_TIMEOUT_MS,
  );

  it('defaults to 4096 iterations', () => {
    expect(scramSha256Verifier(PASSWORD, FIXED_SALT)).toBe(KNOWN_VERIFIER);
  });

  it('gives a different verifier for a different salt', () => {
    const otherSalt = Buffer.alloc(16, 0xff);
    expect(scramSha256Verifier(PASSWORD, otherSalt, ITERATIONS)).not.toBe(KNOWN_VERIFIER);
  });

  it('salts each default call freshly', () => {
    expect(scramSha256Verifier(PASSWORD)).not.toBe(scramSha256Verifier(PASSWORD));
  });

  it('never embeds the password in the verifier', () => {
    expect(scramSha256Verifier(PASSWORD)).not.toContain(PASSWORD);
  });

  it.each(MALFORMED_PASSWORDS)('refuses to hash %s', (_label, password) => {
    const message = thrownMessage(() => scramSha256Verifier(password, FIXED_SALT));
    expect(message).toBe(INVALID);
    if (password) expect(message).not.toContain(password);
  });

  it.each([
    ['an 8-byte salt', Buffer.alloc(8), ITERATIONS],
    ['a 17-byte salt', Buffer.alloc(17), ITERATIONS],
    ['one iteration', FIXED_SALT, 1],
    ['4095 iterations', FIXED_SALT, 4095],
    ['eight-digit iterations', FIXED_SALT, 10_000_000],
    ['fractional iterations', FIXED_SALT, 4096.5],
  ])('refuses %s, which the tenant DB would not accept', (_label, salt, iterations) => {
    expect(() => scramSha256Verifier(PASSWORD, salt, iterations)).toThrow(
      new Error(SCRAM_PARAMETERS_INVALID),
    );
  });

  it.each([
    ['a Uint8Array salt', new Uint8Array(FIXED_SALT)],
    ['a string salt', 'a'.repeat(16)],
  ])('refuses %s, which would not base64-encode as bytes', (_label, salt) => {
    expect(() => scramSha256Verifier(PASSWORD, salt as unknown as Buffer, ITERATIONS)).toThrow(
      new Error(SCRAM_PARAMETERS_INVALID),
    );
  });
});

describe('agent database credential', () => {
  it('generates a 64-character lowercase hex agent password', () => {
    expect(generateAgentDatabaseCredential().agentPassword).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates a fresh password each call', () => {
    expect(generateAgentDatabaseCredential().agentPassword).not.toBe(
      generateAgentDatabaseCredential().agentPassword,
    );
  });

  it('serializes to the exact versioned wire form', () => {
    expect(serializeAgentDatabaseCredential({ agentPassword: PASSWORD })).toBe(
      `{"version":1,"agentPassword":"${PASSWORD}"}`,
    );
  });

  it.each(MALFORMED_PASSWORDS)('refuses to serialize %s', (_label, agentPassword) => {
    const message = thrownMessage(() => serializeAgentDatabaseCredential({ agentPassword }));
    expect(message).toBe(INVALID);
    if (agentPassword) expect(message).not.toContain(agentPassword);
  });

  it('round-trips through serialize and parse', () => {
    const credential = generateAgentDatabaseCredential();
    expect(parseAgentDatabaseCredential(serializeAgentDatabaseCredential(credential))).toEqual(
      credential,
    );
  });

  it.each([
    [
      'an extra key',
      JSON.stringify({ version: 1, agentPassword: PASSWORD, purgePassword: PASSWORD }),
    ],
    ['a missing password', JSON.stringify({ version: 1 })],
    ['a missing version', JSON.stringify({ agentPassword: PASSWORD })],
    ['version 2', JSON.stringify({ version: 2, agentPassword: PASSWORD })],
    ['a string version', JSON.stringify({ version: '1', agentPassword: PASSWORD })],
    ['an uppercase password', JSON.stringify({ version: 1, agentPassword: 'A'.repeat(64) })],
    ['a non-hex password', JSON.stringify({ version: 1, agentPassword: 'g'.repeat(64) })],
    ['a 63-character password', JSON.stringify({ version: 1, agentPassword: 'a'.repeat(63) })],
    ['a 65-character password', JSON.stringify({ version: 1, agentPassword: 'a'.repeat(65) })],
    ['a non-string password', JSON.stringify({ version: 1, agentPassword: 1 })],
    ['an array', JSON.stringify([1, PASSWORD])],
    ['null', 'null'],
    ['non-JSON', 'not json'],
  ])('rejects %s', (_label, raw) => {
    expect(() => parseAgentDatabaseCredential(raw)).toThrow(new Error(INVALID));
  });

  it('never echoes the password in a parse error', () => {
    const leaky = 'b'.repeat(63);
    const cases = [
      JSON.stringify({ version: 2, agentPassword: PASSWORD }),
      JSON.stringify({ version: 1, agentPassword: leaky }),
      `{"version":1,"agentPassword":"${PASSWORD}"`,
    ];
    for (const raw of cases) {
      const message = thrownMessage(() => parseAgentDatabaseCredential(raw));
      expect(message).toBe(INVALID);
      expect(message).not.toContain(PASSWORD);
      expect(message).not.toContain(leaky);
    }
  });
});

describe('agent database env keys', () => {
  it('names the env keys the agent and pool host share', () => {
    expect(AGENT_DATABASE_AUTH_ENV).toBe('AGENT_DATABASE_AUTH');
    expect(AGENT_DATABASE_CREDENTIAL_SSM_PATH_ENV).toBe('AGENT_DATABASE_CREDENTIAL_SSM_PATH');
    expect(AGENT_DATABASE_AUTH_SCRAM).toBe('scram');
  });

  it('types the scram mode as one of the agent database auth modes', () => {
    const modes: readonly AgentDatabaseAuth[] = ['rds_iam', AGENT_DATABASE_AUTH_SCRAM];
    expect(modes).toEqual(['rds_iam', 'scram']);
  });
});

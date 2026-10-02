// SPDX-License-Identifier: Apache-2.0
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';

export const AGENT_DATABASE_AUTH_ENV = 'AGENT_DATABASE_AUTH';
export const AGENT_DATABASE_CREDENTIAL_SSM_PATH_ENV = 'AGENT_DATABASE_CREDENTIAL_SSM_PATH';
export type AgentDatabaseAuth = 'rds_iam' | 'scram';
export const AGENT_DATABASE_AUTH_SCRAM = 'scram' satisfies AgentDatabaseAuth;

const CREDENTIAL_VERSION = 1;
const PASSWORD_BYTES = 32;
const PASSWORD_PATTERN = new RegExp(`^[0-9a-f]{${PASSWORD_BYTES * 2}}$`);
const CREDENTIAL_KEYS = ['agentPassword', 'version'] as const;
const INVALID_CREDENTIAL = 'agent_database_credential_invalid';

const SCRAM_SALT_BYTES = 16;
const SCRAM_DEFAULT_ITERATIONS = 4096;
const SCRAM_MIN_ITERATIONS = 4096;
// A stored SCRAM verifier is accepted with at most a seven-digit iteration count.
const SCRAM_MAX_ITERATIONS = 9_999_999;
const SCRAM_KEY_BYTES = 32;
const SCRAM_DIGEST = 'sha256';
const SCRAM_PARAMETERS_INVALID = 'scram_verifier_parameters_invalid';

// UNWIRED: no caller yet; the credential reader and writer land with plan #2343 (WS-C, WS-D).
/** A database login secret, held only in the SecureString at agentDatabaseCredentialSsmPath. */
export interface AgentDatabaseCredential {
  readonly agentPassword: string;
}

export function generateAgentDatabaseCredential(): AgentDatabaseCredential {
  return { agentPassword: randomBytes(PASSWORD_BYTES).toString('hex') };
}

export function serializeAgentDatabaseCredential(credential: AgentDatabaseCredential): string {
  const { agentPassword } = credential;
  assertAgentPassword(agentPassword);
  return JSON.stringify({ version: CREDENTIAL_VERSION, agentPassword });
}

/** Parses the SSM credential; every failure throws one fixed message so the secret never reaches a log. */
export function parseAgentDatabaseCredential(raw: string): AgentDatabaseCredential {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(INVALID_CREDENTIAL);
  }
  if (!isCredentialRecord(value)) {
    throw new Error(INVALID_CREDENTIAL);
  }
  return { agentPassword: value.agentPassword };
}

/** A Postgres SCRAM-SHA-256 verifier, so only the hash, never the password, reaches the server. */
export function scramSha256Verifier(
  password: string,
  salt: Buffer = randomBytes(SCRAM_SALT_BYTES),
  iterations: number = SCRAM_DEFAULT_ITERATIONS,
): string {
  assertAgentPassword(password);
  assertScramParameters(salt, iterations);
  // RFC 5802/7677; a hex password makes SASLprep the identity, so no normalization is applied.
  const saltedPassword = pbkdf2Sync(password, salt, iterations, SCRAM_KEY_BYTES, SCRAM_DIGEST);
  const clientKey = createHmac(SCRAM_DIGEST, saltedPassword).update('Client Key').digest();
  const storedKey = createHash(SCRAM_DIGEST).update(clientKey).digest('base64');
  const serverKey = createHmac(SCRAM_DIGEST, saltedPassword).update('Server Key').digest('base64');
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}

function isCredentialRecord(value: unknown): value is { version: number; agentPassword: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return (
    keys.length === CREDENTIAL_KEYS.length &&
    keys.every((key, index) => key === CREDENTIAL_KEYS[index]) &&
    record.version === CREDENTIAL_VERSION &&
    isAgentPassword(record.agentPassword)
  );
}

function isAgentPassword(value: unknown): value is string {
  return typeof value === 'string' && PASSWORD_PATTERN.test(value);
}

function assertAgentPassword(value: string): void {
  if (!isAgentPassword(value)) throw new Error(INVALID_CREDENTIAL);
}

function assertScramParameters(salt: Buffer, iterations: number): void {
  const iterationsValid =
    Number.isInteger(iterations) &&
    iterations >= SCRAM_MIN_ITERATIONS &&
    iterations <= SCRAM_MAX_ITERATIONS;
  if (!Buffer.isBuffer(salt) || salt.length !== SCRAM_SALT_BYTES || !iterationsValid) {
    throw new Error(SCRAM_PARAMETERS_INVALID);
  }
}

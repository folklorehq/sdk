// SPDX-License-Identifier: Apache-2.0
import { AppError, type AppErrorOptions } from './AppError.js';

/** Input failed validation (bad request shape, invalid field). */
export class ValidationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'validation_error', category: 'validation' });
  }
}

/** A requested resource does not exist. */
export class NotFoundError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'not_found', category: 'not_found' });
  }
}

/** The caller is authenticated but not allowed to do this (access check). */
export class ForbiddenError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'forbidden', category: 'forbidden' });
  }
}

/** The operation conflicts with current state (e.g. unique violation). */
export class ConflictError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'conflict', category: 'conflict' });
  }
}

/** A staff account cannot change its own role. */
export class CannotChangeSelfError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('Staff self-change is not permitted', {
      ...options,
      code: 'cannot_change_self',
      category: 'conflict',
    });
  }
}

/** More than one instance matches a pool host. */
export class AmbiguousHostError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('More than one instance matches this pool host', {
      ...options,
      code: 'host_instance_ambiguous',
      category: 'conflict',
    });
  }
}

/** The matched instance is not the recorded pool host instance. */
export class HostInstanceMismatchError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('The matched instance is not the recorded pool host instance', {
      ...options,
      code: 'host_instance_mismatch',
      category: 'conflict',
    });
  }
}

/** No live instance carries the pool host's tag. */
export class HostInstanceMissingError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('No instance matches this pool host', {
      ...options,
      code: 'host_instance_missing',
      category: 'conflict',
    });
  }
}

/** The pool host has no recorded region, so it cannot be looked up. */
export class HostLocationUnknownError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('This pool host has no recorded region', {
      ...options,
      code: 'host_location_unknown',
      category: 'conflict',
    });
  }
}

/** A rollout or provisioning holds the pool host. */
export class HostBusyError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('A rollout or provisioning holds this pool host', {
      ...options,
      code: 'host_busy',
      category: 'conflict',
    });
  }
}

/** A role change must leave one or more super admins. */
export class LastSuperAdminError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('The last super admin cannot be removed', {
      ...options,
      code: 'last_super_admin',
      category: 'conflict',
    });
  }
}

/** A staff member's access changed after the caller read it, so the write is refused. */
export class StaffAccessChangedError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('Staff access changed since it was read', {
      ...options,
      code: 'staff_access_changed',
      category: 'conflict',
    });
  }
}

/** The action needs a fresh authenticator or recovery code and the one sent did not verify. */
export class StepUpRequiredError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('A current verification code is required', {
      ...options,
      code: 'step_up_required',
      category: 'forbidden',
    });
  }
}

/** The target is already paused, so a second pause is refused. */
export class AlreadyPausedError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('Already paused', { ...options, code: 'already_paused', category: 'conflict' });
  }
}

/** The target is not paused, so a resume has nothing to undo. */
export class NotPausedError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('Not paused', { ...options, code: 'not_paused', category: 'conflict' });
  }
}

/** A fleet-wide stop is in effect, so a host pause or resume is refused. */
export class FleetStoppedError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('The fleet is stopped', { ...options, code: 'fleet_stopped', category: 'conflict' });
  }
}

/** The target is the platform workspace, which cannot be paused. */
export class PlatformWorkspaceError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('The platform workspace cannot be paused', {
      ...options,
      code: 'platform_workspace',
      category: 'conflict',
    });
  }
}

/** The workspace is not placed on a shared host, so there is nothing to pause it on. */
export class NotOnHostError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('The workspace is not on a host', {
      ...options,
      code: 'not_on_a_host',
      category: 'conflict',
    });
  }
}

/** The host's agent cannot apply a per-workspace pause yet. */
export class HostAgentOutdatedError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('The host cannot apply a workspace pause yet', {
      ...options,
      code: 'host_agent_outdated',
      category: 'conflict',
    });
  }
}

/** A rate limit (ours or an upstream source's) was hit. */
export class RateLimitError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'rate_limit', category: 'rate_limit' });
  }
}

/** An in-flight bound was hit (429); `code` is the one fixed reason, so the response never says which bound. */
export class ConcurrencyLimitError extends AppError {
  constructor(message: string, code: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code, category: 'rate_limit' });
  }
}

/** An upstream source/integration call failed (Slack, GitHub, ...). */
export class ExternalServiceError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code: 'external_service_error', category: 'external' });
  }
}

/** A capability is not wired in this deployment (503); `code` names the specific reason. */
export class ServiceUnavailableError extends AppError {
  constructor(message: string, code: string, options: AppErrorOptions = {}) {
    super(message, { ...options, code, category: 'unavailable' });
  }
}

/** Narrows an optional dependency, throwing `ServiceUnavailableError` instead of leaving each call site to reimplement the absent-service guard. */
export function requireService<T>(service: T | undefined, code: string, message: string): T {
  if (!service) throw new ServiceUnavailableError(message, code);
  return service;
}

/** A ciphertext decrypted, but its bound encryption context (AAD) didn't match what the caller expected — an integrity event (relocated/misrouted ciphertext), not a transient decrypt failure. */
export class EncryptionContextMismatchError extends AppError {
  constructor(mismatchedKeys: readonly string[], options: AppErrorOptions = {}) {
    super(`encryption context mismatch on: ${mismatchedKeys.join(', ')}`, {
      isOperational: false,
      ...options,
      code: 'encryption_context_mismatch',
      category: 'internal',
    });
  }
}

/** Deployment/environment is misconfigured — a bug, not a handled condition. */
export class ConfigurationError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, {
      isOperational: false,
      ...options,
      code: 'configuration_error',
      category: 'internal',
    });
  }
}

/** An org's billing basis (plan, interval or counts) is not one the entitlement contract accepts. */
export class InvalidBillingBasisError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('The billing basis is invalid', {
      ...options,
      code: 'invalid_billing_basis',
      category: 'internal',
    });
  }
}

/** Unexpected internal failure — the default for anything unclassified. */
export class InternalError extends AppError {
  constructor(message: string, options: AppErrorOptions = {}) {
    super(message, {
      isOperational: false,
      ...options,
      code: 'internal_error',
      category: 'internal',
    });
  }
}

/** A sign-in address is already bound to a different identity. Linking is a reviewed operator action, never an unattended adoption. */
export class IdentityLinkRequiredError extends ConflictError {
  constructor(options: AppErrorOptions = {}) {
    super('CLI_ACCOUNT_IDENTITY_LINK_REQUIRED', options);
    this.name = 'IdentityLinkRequiredError';
  }
}

export const PERSONAL_SOURCE_FACT_DENIALS = [
  'org_kind_with_owner',
  'personal_kind_without_owner',
  'derived_field_present',
  'sensitivity_not_pinned',
  'identifier_not_keyed',
  'source_missing',
  'source_not_active',
  'owner_mismatch',
] as const;
export type PersonalSourceFactDenial = (typeof PERSONAL_SOURCE_FACT_DENIALS)[number];

/** A member source row already belongs to a different owner; carries no identifier. */
export class PersonalSourceOwnerConflictError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('PERSONAL_SOURCE_OWNER_CONFLICT', {
      ...options,
      code: 'personal_source_owner_conflict',
      category: 'conflict',
    });
  }
}

/** The provider account is already connected by another member of the org; carries no identifier. */
export class PersonalSourceAccountConflictError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('PERSONAL_SOURCE_ACCOUNT_CONFLICT', {
      ...options,
      code: 'personal_source_account_conflict',
      category: 'conflict',
    });
  }
}

export const PERSONAL_SOURCE_RECONNECT_CONFLICTS = [
  'connection_superseded',
  'disconnect_pending',
] as const;
export type PersonalSourceReconnectConflict = (typeof PERSONAL_SOURCE_RECONNECT_CONFLICTS)[number];

/** A member write whose sealed connection id no longer matches the stored row; `reason` is a closed literal. */
export class PersonalSourceReconnectConflictError extends AppError {
  constructor(
    readonly reason: PersonalSourceReconnectConflict,
    options: AppErrorOptions = {},
  ) {
    super('PERSONAL_SOURCE_RECONNECT_CONFLICT', {
      ...options,
      code: 'personal_source_reconnect_conflict',
      category: 'conflict',
    });
  }
}

/** A source connection write broke the owner-scope rule for its kind; carries no identifier. */
export class SourceConnectionScopeViolationError extends AppError {
  constructor(options: AppErrorOptions = {}) {
    super('SOURCE_SCOPE_VIOLATION', {
      ...options,
      code: 'source_scope_violation',
      category: 'conflict',
    });
  }
}

/** A processed fact failed the member-owned persist rules; `reason` is a closed literal, never fact data. */
export class PersonalSourceFactRejectedError extends AppError {
  constructor(
    readonly reason: PersonalSourceFactDenial,
    options: AppErrorOptions = {},
  ) {
    super('PERSONAL_SOURCE_FACT_REJECTED', {
      ...options,
      code: 'personal_source_fact_rejected',
      category: 'forbidden',
    });
  }
}

export const OVERRIDE_STRATEGIES = {
  THROW: 'throw',
  LAST_WINS: 'last_wins',
  FIRST_WINS: 'first_wins',
  MERGE: 'merge',
  STACK: 'stack',
}

export const EXTENSION_STATES = {
  REGISTERED: 'registered',
  ACTIVE: 'active',
  DISABLED: 'disabled',
  OVERRIDE_CONFLICT: 'override_conflict',
}

export const PERMISSION_ACTIONS = {
  READ_POINT: 'point:read',
  READ_EXTENSION: 'extension:read',
  READ_PACKAGE: 'package:read',
  READ_CONFLICT: 'conflict:read',
  READ_STATS: 'stats:read',
  READ_ROLLBACK: 'rollback:read',
  WRITE_POINT: 'point:write',
  WRITE_EXTENSION: 'extension:write',
  WRITE_PACKAGE: 'package:write',
  REGISTER_PACKAGE: 'package:register',
  ROLLBACK_PACKAGE: 'package:rollback',
  RESOLVE_CONFLICT: 'conflict:resolve',
  CHECK_IMPACT: 'impact:check',
}

export const PERMISSION_SCOPES = {
  PUBLIC: 'public',
  INTERNAL: 'internal',
  ADMIN: 'admin',
}

export class OverrideConflictError extends Error {
  constructor(pointName, existingExtension, newExtension) {
    super(
      `Override conflict on extension point "${pointName}": ` +
      `extension "${existingExtension.id}" is already registered by package "${existingExtension.packageId}", ` +
      `conflicting with "${newExtension.id}" from package "${newExtension.packageId}"`
    )
    this.name = 'OverrideConflictError'
    this.pointName = pointName
    this.existingExtension = existingExtension
    this.newExtension = newExtension
  }
}

export class ExtensionPointNotFoundError extends Error {
  constructor(pointName) {
    super(`Extension point "${pointName}" is not defined`)
    this.name = 'ExtensionPointNotFoundError'
    this.pointName = pointName
  }
}

export class DuplicateExtensionError extends Error {
  constructor(extensionId, pointName) {
    super(`Extension "${extensionId}" is already registered on point "${pointName}"`)
    this.name = 'DuplicateExtensionError'
    this.extensionId = extensionId
    this.pointName = pointName
  }
}

export class PermissionDeniedError extends Error {
  constructor(action, scope = null, details = null) {
    const baseMessage = `Permission denied for action "${action}"`
    const scopeMessage = scope ? ` (required scope: ${scope})` : ''
    const detailsMessage = details ? `: ${details}` : ''
    super(baseMessage + scopeMessage + detailsMessage)
    this.name = 'PermissionDeniedError'
    this.action = action
    this.scope = scope
    this.details = details
  }
}

export class PartialRegistrationError extends Error {
  constructor(packageId, registeredExtensions, failedExtensions, errors) {
    super(`Package "${packageId}" registered partially: ${registeredExtensions.length} succeeded, ${failedExtensions.length} failed`)
    this.name = 'PartialRegistrationError'
    this.packageId = packageId
    this.registeredExtensions = registeredExtensions
    this.failedExtensions = failedExtensions
    this.errors = errors
  }
}

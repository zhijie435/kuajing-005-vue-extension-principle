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

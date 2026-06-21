import { reactive, computed, toRaw } from 'vue'
import {
  OVERRIDE_STRATEGIES,
  EXTENSION_STATES,
  PERMISSION_ACTIONS,
  PERMISSION_SCOPES,
  OverrideConflictError,
  ExtensionPointNotFoundError,
  DuplicateExtensionError,
  PermissionDeniedError,
  PartialRegistrationError,
} from './constants'
import {
  validatePointName,
  validatePackageId,
  validateStrategy,
  validateExtensionId,
} from './validator'

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

class ExtensionPointManager {
  constructor(options = {}) {
    this._points = reactive({})
    this._extensions = reactive({})
    this._packages = reactive({})
    this._conflicts = reactive([])
    this._rollbacks = reactive({})
    this._options = {
      defaultStrategy: options.defaultStrategy || OVERRIDE_STRATEGIES.LAST_WINS,
      logLevel: options.logLevel ?? LOG_LEVELS.WARN,
      onConflict: options.onConflict || null,
      strictOverride: options.strictOverride || false,
      enablePermissionCheck: options.enablePermissionCheck ?? false,
      defaultScope: options.defaultScope || PERMISSION_SCOPES.PUBLIC,
      permissionChecker: options.permissionChecker || null,
      scopeResolver: options.scopeResolver || null,
    }
    this._listeners = new Map()
    this._logLevel = this._options.logLevel
    this._currentScope = this._options.defaultScope
  }

  setScope(scope) {
    if (!Object.values(PERMISSION_SCOPES).includes(scope)) {
      throw new Error(`Invalid scope: ${scope}`)
    }
    this._currentScope = scope
    return this
  }

  getScope() {
    return this._currentScope
  }

  _checkPermission(action, options = {}) {
    if (!this._options.enablePermissionCheck) {
      return true
    }

    const requiredScope = options.requiredScope || this._getActionRequiredScope(action)
    const currentScope = this._options.scopeResolver
      ? this._options.scopeResolver()
      : this._currentScope

    if (this._options.permissionChecker) {
      const result = this._options.permissionChecker(action, currentScope, options)
      if (result !== true) {
        throw new PermissionDeniedError(
          action,
          requiredScope,
          typeof result === 'string' ? result : null
        )
      }
      return true
    }

    const scopeHierarchy = [PERMISSION_SCOPES.PUBLIC, PERMISSION_SCOPES.INTERNAL, PERMISSION_SCOPES.ADMIN]
    const currentLevel = scopeHierarchy.indexOf(currentScope)
    const requiredLevel = scopeHierarchy.indexOf(requiredScope)

    if (currentLevel < requiredLevel) {
      throw new PermissionDeniedError(action, requiredScope)
    }

    return true
  }

  _getActionRequiredScope(action) {
    const scopeMap = {
      [PERMISSION_ACTIONS.READ_POINT]: PERMISSION_SCOPES.PUBLIC,
      [PERMISSION_ACTIONS.READ_EXTENSION]: PERMISSION_SCOPES.PUBLIC,
      [PERMISSION_ACTIONS.READ_PACKAGE]: PERMISSION_SCOPES.PUBLIC,
      [PERMISSION_ACTIONS.READ_CONFLICT]: PERMISSION_SCOPES.INTERNAL,
      [PERMISSION_ACTIONS.READ_STATS]: PERMISSION_SCOPES.PUBLIC,
      [PERMISSION_ACTIONS.READ_ROLLBACK]: PERMISSION_SCOPES.INTERNAL,
      [PERMISSION_ACTIONS.WRITE_POINT]: PERMISSION_SCOPES.ADMIN,
      [PERMISSION_ACTIONS.WRITE_EXTENSION]: PERMISSION_SCOPES.INTERNAL,
      [PERMISSION_ACTIONS.WRITE_PACKAGE]: PERMISSION_SCOPES.ADMIN,
      [PERMISSION_ACTIONS.REGISTER_PACKAGE]: PERMISSION_SCOPES.INTERNAL,
      [PERMISSION_ACTIONS.ROLLBACK_PACKAGE]: PERMISSION_SCOPES.ADMIN,
      [PERMISSION_ACTIONS.RESOLVE_CONFLICT]: PERMISSION_SCOPES.ADMIN,
      [PERMISSION_ACTIONS.CHECK_IMPACT]: PERMISSION_SCOPES.INTERNAL,
    }
    return scopeMap[action] || PERMISSION_SCOPES.ADMIN
  }

  validatePackageRegistration(pkg) {
    const result = {
      valid: true,
      canInstall: true,
      errors: [],
      warnings: [],
      conflicts: [],
      extensionValidations: [],
    }

    if (!pkg || !pkg.id) {
      result.valid = false
      result.canInstall = false
      result.errors.push({ field: 'id', message: '扩展包ID不能为空' })
      return result
    }

    const idValidation = validatePackageId(pkg.id)
    if (!idValidation.valid) {
      result.valid = false
      result.errors.push({ field: 'id', message: idValidation.firstError?.message || '扩展包ID无效' })
    }

    if (!pkg.name || !pkg.name.trim()) {
      result.valid = false
      result.errors.push({ field: 'name', message: '扩展包名称不能为空' })
    }

    if (pkg.version) {
      const v = String(pkg.version).trim()
      if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/.test(v)) {
        result.valid = false
        result.errors.push({ field: 'version', message: '版本号格式无效，应为 semver 格式' })
      }
    }

    const extensions = pkg.extensions || []
    if (!Array.isArray(extensions)) {
      result.valid = false
      result.errors.push({ field: 'extensions', message: 'extensions 必须是数组' })
      return result
    }

    extensions.forEach((extDef, idx) => {
      const extValidation = this._validateExtensionDefinition(extDef)
      result.extensionValidations.push({
        index: idx,
        point: extDef.point || '(unknown)',
        valid: extValidation.valid,
        errors: extValidation.errors,
        warnings: extValidation.warnings,
        conflicts: extValidation.conflicts,
      })

      if (!extValidation.valid) {
        result.valid = false
      }
      if (!extValidation.canInstall) {
        result.canInstall = false
      }
      result.warnings = result.warnings.concat(extValidation.warnings)
      result.conflicts = result.conflicts.concat(extValidation.conflicts)
      result.errors = result.errors.concat(extValidation.errors)
    })

    this._emit('package:validated', { packageId: pkg.id, result })
    return result
  }

  _validateExtensionDefinition(extDef) {
    const result = {
      valid: true,
      canInstall: true,
      errors: [],
      warnings: [],
      conflicts: [],
    }

    const pointName = extDef.point || ''
    if (!pointName) {
      result.valid = false
      result.errors.push({ field: 'point', message: '扩展点不能为空' })
      return result
    }

    const pointConfig = this._points[pointName]
    if (!pointConfig) {
      result.warnings.push({
        type: 'missing_point',
        pointName,
        message: `扩展点 "${pointName}" 尚未定义，注册后该扩展不会生效`,
      })
    }

    if (extDef.id) {
      const idValidation = validateExtensionId(extDef.id)
      if (!idValidation.valid) {
        result.valid = false
        result.errors.push({ field: 'id', message: idValidation.firstError?.message || '扩展ID无效' })
      }
    }

    if (extDef.override) {
      if (!extDef.overrideTargets || !Array.isArray(extDef.overrideTargets) || extDef.overrideTargets.length === 0) {
        result.valid = false
        result.errors.push({ field: 'overrideTargets', message: `标记为覆盖扩展时必须指定覆盖目标 (point: ${pointName})` })
      } else if (pointConfig) {
        const existingIds = new Set((this._extensions[pointName] || []).map(e => e.id))
        const missing = extDef.overrideTargets.filter(t => !existingIds.has(t))
        if (missing.length > 0 && existingIds.size > 0) {
          result.valid = false
          result.errors.push({
            field: 'overrideTargets',
            message: `覆盖目标不存在: ${missing.join(', ')} (point: ${pointName})`,
          })
        } else if (missing.length > 0 && existingIds.size === 0) {
          result.warnings.push({
            type: 'missing_override_target',
            pointName,
            missingTargets: missing,
            message: `覆盖目标 "${missing.join(', ')}" 目前不存在，但若后续注册则可正常覆盖 (point: ${pointName})`,
          })
        }
      }
    }

    if (pointConfig) {
      const existing = this._extensions[pointName] || []
      if (!pointConfig.multiple && existing.length > 0) {
        result.conflicts.push({
          type: 'single_point_conflict',
          pointName,
          existingCount: existing.length,
          strategy: pointConfig.strategy,
          message: `扩展点 "${pointName}" 配置为单扩展模式，已有 ${existing.length} 个活跃扩展，策略: ${pointConfig.strategy}`,
        })
        if (pointConfig.strategy === OVERRIDE_STRATEGIES.THROW) {
          result.canInstall = false
        }
      }

      if (extDef.overrideTargets && Array.isArray(extDef.overrideTargets)) {
        for (const e of existing) {
          if (extDef.overrideTargets.includes(e.id)) {
            result.conflicts.push({
              type: 'explicit_override',
              pointName,
              existingExtension: e.id,
              existingPackage: e.packageId,
              incomingExtension: extDef.id || `${pointName}::auto`,
              resolution: 'incoming_replaces_existing',
              message: `将覆盖扩展 "${e.id}" (包: ${e.packageId})`,
            })
          }
        }
      }
    }

    if (extDef.priority !== undefined && extDef.priority !== null && extDef.priority !== '') {
      const num = Number(extDef.priority)
      if (isNaN(num) || !Number.isInteger(num)) {
        result.valid = false
        result.errors.push({ field: 'priority', message: `优先级必须为整数 (point: ${pointName})` })
      }
    }
    if (extDef.order !== undefined && extDef.order !== null && extDef.order !== '') {
      const num = Number(extDef.order)
      if (isNaN(num) || !Number.isInteger(num)) {
        result.valid = false
        result.errors.push({ field: 'order', message: `排序必须为整数 (point: ${pointName})` })
      }
    }

    return result
  }

  _log(level, ...args) {
    if (LOG_LEVELS[level] >= this._logLevel) {
      const prefix = `[ExtensionPoint:${level}]`
      if (level === 'ERROR') console.error(prefix, ...args)
      else if (level === 'WARN') console.warn(prefix, ...args)
      else console.log(prefix, ...args)
    }
  }

  definePoint(name, config = {}) {
    this._checkPermission(PERMISSION_ACTIONS.WRITE_POINT, { pointName: name })

    if (this._points[name]) {
      this._log('WARN', `Extension point "${name}" already defined, redefining`)
    }
    const nameValidation = validatePointName(name)
    if (!nameValidation.valid) {
      throw new Error(nameValidation.firstError.message)
    }
    if (config.strategy) {
      const strategyValidation = validateStrategy(config.strategy)
      if (!strategyValidation.valid) {
        throw new Error(strategyValidation.firstError.message)
      }
    }
    this._points[name] = reactive({
      name,
      description: config.description || '',
      strategy: config.strategy || this._options.defaultStrategy,
      multiple: config.multiple !== false,
      required: config.required || false,
      validator: config.validator || null,
      metadata: config.metadata || {},
      createdAt: Date.now(),
    })
    if (!this._extensions[name]) {
      this._extensions[name] = reactive([])
    }
    this._emit('point:defined', { pointName: name, config })
    this._log('INFO', `Extension point "${name}" defined with strategy "${this._points[name].strategy}"`)
    return this
  }

  removePoint(name) {
    this._checkPermission(PERMISSION_ACTIONS.WRITE_POINT, { pointName: name })

    if (!this._points[name]) return this
    delete this._points[name]
    delete this._extensions[name]
    this._conflicts = this._conflicts.filter(c => c.pointName !== name)
    this._emit('point:removed', { pointName: name })
    return this
  }

  registerPackage(pkg, options = {}) {
    this._checkPermission(PERMISSION_ACTIONS.REGISTER_PACKAGE, { packageId: pkg?.id })

    if (!pkg || !pkg.id) {
      throw new Error('Package must have an id')
    }
    const idValidation = validatePackageId(pkg.id)
    if (!idValidation.valid) {
      throw new Error(idValidation.firstError.message)
    }

    const skipRollback = options.skipRollback === true
    const failOnPartialError = options.failOnPartialError === true
    const existingRollback = this._rollbacks[pkg.id]

    const rollbackContext = {
      disabledExtensions: [],
      createdExtensions: [],
      createdConflicts: [],
      previousPackageState: this._packages[pkg.id] ? { ...this._packages[pkg.id] } : null,
    }

    const registrationResult = {
      registeredExtensions: [],
      failedExtensions: [],
      errors: [],
    }

    const originalResolveByReplacement = this._resolveByReplacement.bind(this)
    this._resolveByReplacement = (pointName, existingExt, newExt) => {
      rollbackContext.disabledExtensions.push({
        id: existingExt.id,
        pointName,
        previousState: existingExt.state,
      })
      originalResolveByReplacement(pointName, existingExt, newExt)
    }

    const originalResolveByMerge = this._resolveByMerge.bind(this)
    this._resolveByMerge = (pointName, existingExt, newExt) => {
      rollbackContext.disabledExtensions.push({
        id: existingExt.id,
        pointName,
        previousState: existingExt.state,
      })
      originalResolveByMerge(pointName, existingExt, newExt)
    }

    const originalConflictCount = this._conflicts.length

    if (this._packages[pkg.id]) {
      this._log('WARN', `Package "${pkg.id}" already registered, updating`)
    }

    this._packages[pkg.id] = reactive({
      id: pkg.id,
      name: pkg.name || pkg.id,
      version: pkg.version || '1.0.0',
      description: pkg.description || '',
      extensions: pkg.extensions || [],
      dependencies: pkg.dependencies || [],
      enabled: pkg.enabled !== false,
      installedAt: Date.now(),
    })

    if (pkg.extensions && pkg.extensions.length > 0) {
      for (let i = 0; i < pkg.extensions.length; i++) {
        const ext = pkg.extensions[i]
        try {
          const registered = this.register(pkg.id, ext)
          if (registered) {
            rollbackContext.createdExtensions.push({
              id: registered.id,
              pointName: registered.point,
            })
            registrationResult.registeredExtensions.push({
              index: i,
              id: registered.id,
              pointName: registered.point,
            })
          }
        } catch (e) {
          const errorInfo = {
            index: i,
            extension: ext,
            point: ext.point || '(unknown)',
            message: e.message,
            error: e,
          }
          registrationResult.failedExtensions.push(errorInfo)
          registrationResult.errors.push(e)
          this._log('ERROR', `Failed to register extension [${i}] for package "${pkg.id}" on point "${errorInfo.point}":`, e.message)
        }
      }
    }

    for (let i = originalConflictCount; i < this._conflicts.length; i++) {
      rollbackContext.createdConflicts.push(this._conflicts[i].id)
    }

    this._resolveByReplacement = originalResolveByReplacement
    this._resolveByMerge = originalResolveByMerge

    if (!skipRollback) {
      this._rollbacks[pkg.id] = reactive({
        packageId: pkg.id,
        operationType: 'register',
        ...rollbackContext,
        registrationResult: { ...registrationResult },
        rolledBack: false,
        createdAt: Date.now(),
      })
    } else if (existingRollback && !existingRollback.rolledBack) {
      this._rollbacks[pkg.id] = existingRollback
    }

    this._emit('package:registered', {
      packageId: pkg.id,
      pkg,
      rollbackContext,
      registrationResult,
    })

    if (registrationResult.failedExtensions.length > 0) {
      this._log(
        'WARN',
        `Package "${pkg.id}" registered with ${registrationResult.failedExtensions.length} failed extensions out of ${pkg.extensions.length}`
      )
      if (failOnPartialError) {
        throw new PartialRegistrationError(
          pkg.id,
          registrationResult.registeredExtensions,
          registrationResult.failedExtensions,
          registrationResult.errors
        )
      }
    } else {
      this._log('INFO', `Package "${pkg.id}" v${pkg.version || '1.0.0'} registered successfully`)
    }

    return {
      success: registrationResult.failedExtensions.length === 0,
      package: this._packages[pkg.id],
      ...registrationResult,
    }
  }

  rollbackPackage(packageId) {
    this._checkPermission(PERMISSION_ACTIONS.ROLLBACK_PACKAGE, { packageId })

    const rollback = this._rollbacks[packageId]
    if (!rollback || rollback.rolledBack) {
      this._log('WARN', `No rollback data for package "${packageId}", will perform simple unregister`)
      this._simpleUnregisterPackage(packageId)
      return { success: false, message: `没有可回滚的记录，已执行删除操作` }
    }

    const result = {
      success: true,
      restoredExtensions: [],
      removedExtensions: [],
      removedConflicts: [],
    }

    rollback.disabledExtensions.forEach(info => {
      const extList = this._extensions[info.pointName]
      if (extList) {
        const ext = extList.find(e => e.id === info.id)
        if (ext) {
          ext.state = info.previousState || EXTENSION_STATES.ACTIVE
          result.restoredExtensions.push(info.id)
        }
      }
    })

    rollback.createdExtensions.forEach(info => {
      const extList = this._extensions[info.pointName]
      if (extList) {
        const idx = extList.findIndex(e => e.id === info.id)
        if (idx !== -1) {
          extList.splice(idx, 1)
          result.removedExtensions.push(info.id)
        }
      }
    })

    if (rollback.createdConflicts.length > 0) {
      this._conflicts = this._conflicts.filter(c => !rollback.createdConflicts.includes(c.id))
      result.removedConflicts = rollback.createdConflicts
    }

    if (rollback.previousPackageState) {
      this._packages[packageId] = reactive(rollback.previousPackageState)
    } else {
      delete this._packages[packageId]
    }

    rollback.rolledBack = true
    rollback.rolledBackAt = Date.now()

    this._emit('package:rolledback', { packageId, result })
    this._log('INFO', `Package "${packageId}" rolled back`)
    return result
  }

  _simpleUnregisterPackage(packageId) {
    const pkg = this._packages[packageId]
    if (!pkg) return

    for (const pointName of Object.keys(this._extensions)) {
      this._extensions[pointName] = this._extensions[pointName].filter(e => e.packageId !== packageId)
    }
    this._conflicts = this._conflicts.filter(
      c => c.existingExtension?.packageId !== packageId && c.incomingExtension?.packageId !== packageId
    )
    delete this._packages[packageId]
  }

  register(packageId, extension) {
    this._checkPermission(PERMISSION_ACTIONS.WRITE_EXTENSION, {
      packageId,
      pointName: extension?.point,
    })

    if (!extension || !extension.point) {
      throw new Error('Extension must specify a "point" property')
    }
    if (!this._points[extension.point]) {
      throw new ExtensionPointNotFoundError(extension.point)
    }

    const pointName = extension.point
    const pointConfig = this._points[pointName]
    const extId = extension.id || `${packageId}::${pointName}::${Date.now()}`

    if (extension.id) {
      const idValidation = validateExtensionId(extension.id)
      if (!idValidation.valid) {
        throw new Error(idValidation.firstError.message)
      }
    }

    if (extension.override) {
      if (!extension.overrideTargets || !Array.isArray(extension.overrideTargets) || extension.overrideTargets.length === 0) {
        throw new Error(`标记为覆盖扩展时必须指定覆盖目标 (point: ${pointName})`)
      }
      const existingIds = new Set(
        (this._extensions[pointName] || []).map(e => e.id)
      )
      const missing = extension.overrideTargets.filter(t => !existingIds.has(t))
      if (missing.length > 0) {
        throw new Error(
          `覆盖目标不存在: ${missing.join(', ')}。` +
          `当前扩展点 "${pointName}" 的已注册扩展: ${[...existingIds].join(', ') || '(无)'}`
        )
      }
    }

    const extRecord = reactive({
      id: extId,
      point: pointName,
      packageId,
      component: extension.component || null,
      render: extension.render || null,
      props: extension.props || {},
      order: extension.order ?? 100,
      priority: extension.priority ?? 0,
      state: EXTENSION_STATES.REGISTERED,
      override: extension.override || false,
      overrideTargets: extension.overrideTargets || [],
      metadata: extension.metadata || {},
      registeredAt: Date.now(),
    })

    if (pointConfig.validator && !pointConfig.validator(extRecord)) {
      throw new Error(`Extension "${extId}" failed validation for point "${pointName}"`)
    }

    const existingIdx = this._extensions[pointName].findIndex(e => e.id === extId)
    if (existingIdx !== -1) {
      throw new DuplicateExtensionError(extId, pointName)
    }

    const conflicts = this._checkOverrideConflict(pointName, extRecord, pointConfig)
    if (conflicts.length > 0) {
      this._handleOverrideConflicts(pointName, extRecord, conflicts, pointConfig)
    } else {
      this._extensions[pointName].push(extRecord)
      extRecord.state = EXTENSION_STATES.ACTIVE
    }

    this._sortExtensions(pointName)
    this._emit('extension:registered', { pointName, extension: extRecord, packageId })
    this._log('INFO', `Extension "${extId}" registered on point "${pointName}" by package "${packageId}"`)
    return extRecord
  }

  _checkOverrideConflict(pointName, newExt, pointConfig) {
    const conflicts = []
    const existing = this._extensions[pointName]

    for (const ext of existing) {
      if (ext.id === newExt.id) continue

      if (newExt.override && newExt.overrideTargets.includes(ext.id)) {
        conflicts.push({
          type: 'explicit_override',
          existing: ext,
          incoming: newExt,
          resolution: 'incoming_replaces_existing',
        })
        continue
      }

      if (ext.override && ext.overrideTargets.includes(newExt.id)) {
        conflicts.push({
          type: 'explicit_override',
          existing: ext,
          incoming: newExt,
          resolution: 'existing_replaces_incoming',
        })
        continue
      }

      if (!pointConfig.multiple && existing.length > 0) {
        conflicts.push({
          type: 'single_point_conflict',
          existing: ext,
          incoming: newExt,
          resolution: null,
        })
      }
    }

    return conflicts
  }

  _handleOverrideConflicts(pointName, newExt, conflicts, pointConfig) {
    const strategy = pointConfig.strategy

    for (const conflict of conflicts) {
      const conflictRecord = reactive({
        id: `conflict_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        pointName,
        type: conflict.type,
        existingExtension: conflict.existing,
        incomingExtension: conflict.incoming,
        strategy,
        resolved: false,
        resolution: null,
        detectedAt: Date.now(),
      })

      if (conflict.resolution === 'incoming_replaces_existing') {
        this._resolveByReplacement(pointName, conflict.existing, newExt)
        conflictRecord.resolved = true
        conflictRecord.resolution = 'incoming_override'
        newExt.state = EXTENSION_STATES.ACTIVE
      } else if (conflict.resolution === 'existing_replaces_incoming') {
        conflictRecord.resolved = true
        conflictRecord.resolution = 'existing_override'
        newExt.state = EXTENSION_STATES.OVERRIDE_CONFLICT
        this._extensions[pointName].push(newExt)
      } else {
        switch (strategy) {
          case OVERRIDE_STRATEGIES.THROW:
            this._conflicts.push(conflictRecord)
            if (this._options.onConflict) {
              this._options.onConflict(conflictRecord)
            }
            this._emit('conflict:detected', conflictRecord)
            throw new OverrideConflictError(pointName, conflict.existing, newExt)

          case OVERRIDE_STRATEGIES.LAST_WINS:
            this._resolveByReplacement(pointName, conflict.existing, newExt)
            conflictRecord.resolved = true
            conflictRecord.resolution = 'last_wins'
            newExt.state = EXTENSION_STATES.ACTIVE
            break

          case OVERRIDE_STRATEGIES.FIRST_WINS:
            conflictRecord.resolved = true
            conflictRecord.resolution = 'first_wins'
            newExt.state = EXTENSION_STATES.OVERRIDE_CONFLICT
            this._extensions[pointName].push(newExt)
            break

          case OVERRIDE_STRATEGIES.MERGE:
            this._resolveByMerge(pointName, conflict.existing, newExt)
            conflictRecord.resolved = true
            conflictRecord.resolution = 'merged'
            break

          case OVERRIDE_STRATEGIES.STACK:
            this._extensions[pointName].push(newExt)
            newExt.state = EXTENSION_STATES.ACTIVE
            conflictRecord.resolved = true
            conflictRecord.resolution = 'stacked'
            break

          default:
            this._extensions[pointName].push(newExt)
            newExt.state = EXTENSION_STATES.ACTIVE
        }
      }

      if (!this._conflicts.includes(conflictRecord)) {
        this._conflicts.push(conflictRecord)
      }
      if (this._options.onConflict) {
        this._options.onConflict(conflictRecord)
      }
      this._emit('conflict:detected', conflictRecord)
    }
  }

  _resolveByReplacement(pointName, existingExt, newExt) {
    const list = this._extensions[pointName]
    const idx = list.findIndex(e => e.id === existingExt.id)
    if (idx !== -1) {
      existingExt.state = EXTENSION_STATES.DISABLED
      this._extensions[pointName].push(newExt)
      newExt.state = EXTENSION_STATES.ACTIVE
      this._log('INFO', `Extension "${newExt.id}" replaced "${existingExt.id}" on point "${pointName}"`)
    } else {
      this._extensions[pointName].push(newExt)
      newExt.state = EXTENSION_STATES.ACTIVE
    }
  }

  _resolveByMerge(pointName, existingExt, newExt) {
    const merged = reactive({
      ...existingExt,
      id: `${existingExt.id}__merged__${newExt.id}`,
      props: { ...toRaw(existingExt.props), ...newExt.props },
      metadata: { ...toRaw(existingExt.metadata), ...newExt.metadata },
      state: EXTENSION_STATES.ACTIVE,
      mergedFrom: [existingExt.id, newExt.id],
      mergedAt: Date.now(),
    })
    const list = this._extensions[pointName]
    const idx = list.findIndex(e => e.id === existingExt.id)
    if (idx !== -1) {
      existingExt.state = EXTENSION_STATES.DISABLED
      this._extensions[pointName].push(merged)
    } else {
      this._extensions[pointName].push(merged)
    }
    this._log('INFO', `Extensions merged on point "${pointName}": ${merged.id}`)
  }

  _sortExtensions(pointName) {
    const list = this._extensions[pointName]
    if (!list) return
    this._extensions[pointName] = list.sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority
      return a.order - b.order
    })
  }

  unregister(extensionId, pointName) {
    this._checkPermission(PERMISSION_ACTIONS.WRITE_EXTENSION, { extensionId, pointName })

    if (!pointName) {
      for (const name of Object.keys(this._extensions)) {
        const idx = this._extensions[name].findIndex(e => e.id === extensionId)
        if (idx !== -1) {
          pointName = name
          break
        }
      }
    }
    if (!pointName || !this._extensions[pointName]) return false
    const list = this._extensions[pointName]
    const idx = list.findIndex(e => e.id === extensionId)
    if (idx === -1) return false
    const [removed] = list.splice(idx, 1)
    this._emit('extension:unregistered', { pointName, extension: removed })
    this._log('INFO', `Extension "${extensionId}" unregistered from point "${pointName}"`)
    return true
  }

  resolve(pointName, context = {}) {
    this._checkPermission(PERMISSION_ACTIONS.READ_EXTENSION, { pointName })

    if (!this._points[pointName]) {
      throw new ExtensionPointNotFoundError(pointName)
    }
    const extensions = this._extensions[pointName] || []
    const active = extensions.filter(e => e.state === EXTENSION_STATES.ACTIVE)
    return active.map(ext => ({
      id: ext.id,
      point: ext.point,
      packageId: ext.packageId,
      component: ext.component,
      render: ext.render,
      props: { ...toRaw(ext.props), ...context },
      order: ext.order,
      priority: ext.priority,
      metadata: ext.metadata,
    }))
  }

  resolveComponent(pointName, context = {}) {
    const resolved = this.resolve(pointName, context)
    const pointConfig = this._points[pointName]
    if (!pointConfig?.multiple && resolved.length > 0) {
      return resolved[0]
    }
    return resolved
  }

  getPoint(name) {
    this._checkPermission(PERMISSION_ACTIONS.READ_POINT, { pointName: name })
    return this._points[name] || null
  }

  getPoints() {
    this._checkPermission(PERMISSION_ACTIONS.READ_POINT)
    return Object.values(this._points)
  }

  getExtensions(pointName) {
    this._checkPermission(PERMISSION_ACTIONS.READ_EXTENSION, { pointName })
    if (pointName) {
      return this._extensions[pointName] || []
    }
    const all = []
    for (const exts of Object.values(this._extensions)) {
      all.push(...exts)
    }
    return all
  }

  getPackage(packageId) {
    this._checkPermission(PERMISSION_ACTIONS.READ_PACKAGE, { packageId })
    return this._packages[packageId] || null
  }

  getPackages() {
    this._checkPermission(PERMISSION_ACTIONS.READ_PACKAGE)
    return Object.values(this._packages)
  }

  getConflicts(options = {}) {
    this._checkPermission(PERMISSION_ACTIONS.READ_CONFLICT, options)
    let conflicts = [...this._conflicts]
    if (options.pointName) {
      conflicts = conflicts.filter(c => c.pointName === options.pointName)
    }
    if (options.resolved !== undefined) {
      conflicts = conflicts.filter(c => c.resolved === options.resolved)
    }
    if (options.unresolved) {
      conflicts = conflicts.filter(c => !c.resolved)
    }
    return conflicts
  }

  checkOverrideImpact(packageId) {
    this._checkPermission(PERMISSION_ACTIONS.CHECK_IMPACT, { packageId })

    const pkg = this._packages[packageId]
    if (!pkg) return { canInstall: true, conflicts: [], warnings: [] }

    const impacts = { canInstall: true, conflicts: [], warnings: [] }

    for (const extDef of pkg.extensions) {
      const pointName = extDef.point
      const pointConfig = this._points[pointName]

      if (!pointConfig) {
        impacts.warnings.push({
          type: 'missing_point',
          pointName,
          message: `Extension point "${pointName}" is not defined`,
        })
        continue
      }

      const existing = this._extensions[pointName] || []
      for (const ext of existing) {
        if (!pointConfig.multiple) {
          impacts.conflicts.push({
            type: 'single_point_conflict',
            pointName,
            existingExtension: ext.id,
            existingPackage: ext.packageId,
            incomingExtension: extDef.id || `${packageId}::${pointName}`,
            resolution: pointConfig.strategy,
            blocksInstallation: pointConfig.strategy === OVERRIDE_STRATEGIES.THROW,
          })
        }
        if (extDef.override && extDef.overrideTargets?.includes(ext.id)) {
          impacts.conflicts.push({
            type: 'explicit_override',
            pointName,
            existingExtension: ext.id,
            existingPackage: ext.packageId,
            incomingExtension: extDef.id || `${packageId}::${pointName}`,
            resolution: 'incoming_replaces_existing',
            blocksInstallation: false,
          })
        }
      }
    }

    impacts.canInstall = impacts.conflicts.filter(c => c.blocksInstallation).length === 0

    return impacts
  }

  getStats() {
    this._checkPermission(PERMISSION_ACTIONS.READ_STATS)
    const points = Object.keys(this._points).length
    const extensions = this.getExtensions().length
    const active = this.getExtensions().filter(e => e.state === EXTENSION_STATES.ACTIVE).length
    const packages = Object.keys(this._packages).length
    const conflicts = this._conflicts.length
    const unresolved = this._conflicts.filter(c => !c.resolved).length
    return { points, extensions, active, packages, conflicts, unresolved }
  }

  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event).add(handler)
    return () => {
      this._listeners.get(event)?.delete(handler)
    }
  }

  _emit(event, data) {
    const handlers = this._listeners.get(event)
    if (handlers) {
      handlers.forEach(handler => handler(data))
    }
    const allHandlers = this._listeners.get('*')
    if (allHandlers) {
      allHandlers.forEach(handler => handler(event, data))
    }
  }

  getRollback(packageId) {
    this._checkPermission(PERMISSION_ACTIONS.READ_ROLLBACK, { packageId })
    return this._rollbacks[packageId] || null
  }

  getRollbacks() {
    this._checkPermission(PERMISSION_ACTIONS.READ_ROLLBACK)
    return Object.values(this._rollbacks)
  }

  canRollbackPackage(packageId) {
    this._checkPermission(PERMISSION_ACTIONS.ROLLBACK_PACKAGE, { packageId })
    const rb = this._rollbacks[packageId]
    return rb && !rb.rolledBack
  }

  validateAndRegisterPackage(pkg) {
    this._checkPermission(PERMISSION_ACTIONS.REGISTER_PACKAGE, { packageId: pkg?.id })

    const validation = this.validatePackageRegistration(pkg)
    if (!validation.valid) {
      return {
        success: false,
        validation,
        registered: null,
        error: 'Package validation failed',
        errors: validation.errors,
      }
    }
    try {
      const result = this.registerPackage(pkg, { failOnPartialError: false })
      return {
        success: result.success,
        validation,
        registered: result.package,
        registeredExtensions: result.registeredExtensions,
        failedExtensions: result.failedExtensions,
        errors: result.errors.map(e => e.message),
      }
    } catch (e) {
      if (e instanceof PartialRegistrationError) {
        return {
          success: false,
          validation,
          registered: this._packages[pkg.id] || null,
          registeredExtensions: e.registeredExtensions,
          failedExtensions: e.failedExtensions,
          error: e.message,
          errors: e.errors.map(err => err.message),
          partialError: true,
        }
      }
      return {
        success: false,
        validation,
        registered: null,
        error: e.message,
        errors: [e.message],
      }
    }
  }

  reset(options = {}) {
    const keepRollbacks = options.keepRollbacks === true
    const preservedRollbacks = keepRollbacks ? { ...this._rollbacks } : null

    for (const key of Object.keys(this._points)) {
      delete this._points[key]
    }
    for (const key of Object.keys(this._extensions)) {
      delete this._extensions[key]
    }
    for (const key of Object.keys(this._packages)) {
      delete this._packages[key]
    }
    for (const key of Object.keys(this._rollbacks)) {
      delete this._rollbacks[key]
    }
    this._conflicts.splice(0, this._conflicts.length)

    if (preservedRollbacks) {
      Object.assign(this._rollbacks, preservedRollbacks)
    }

    this._log('INFO', 'ExtensionPointManager reset' + (keepRollbacks ? ' (rollbacks preserved)' : ''))
  }
}

let _instance = null

export function createExtensionManager(options) {
  _instance = new ExtensionPointManager(options)
  return _instance
}

export function useExtensionManager() {
  if (!_instance) {
    _instance = new ExtensionPointManager()
  }
  return _instance
}

export { ExtensionPointManager }
export default ExtensionPointManager

import { reactive, computed, toRaw } from 'vue'
import {
  OVERRIDE_STRATEGIES,
  EXTENSION_STATES,
  OverrideConflictError,
  ExtensionPointNotFoundError,
  DuplicateExtensionError,
} from './constants'

const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 }

class ExtensionPointManager {
  constructor(options = {}) {
    this._points = reactive({})
    this._extensions = reactive({})
    this._packages = reactive({})
    this._conflicts = reactive([])
    this._options = {
      defaultStrategy: options.defaultStrategy || OVERRIDE_STRATEGIES.LAST_WINS,
      logLevel: options.logLevel ?? LOG_LEVELS.WARN,
      onConflict: options.onConflict || null,
      strictOverride: options.strictOverride || false,
    }
    this._listeners = new Map()
    this._logLevel = this._options.logLevel
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
    if (this._points[name]) {
      this._log('WARN', `Extension point "${name}" already defined, redefining`)
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
    if (!this._points[name]) return this
    delete this._points[name]
    delete this._extensions[name]
    this._conflicts = this._conflicts.filter(c => c.pointName !== name)
    this._emit('point:removed', { pointName: name })
    return this
  }

  registerPackage(pkg) {
    if (!pkg || !pkg.id) {
      throw new Error('Package must have an id')
    }
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
    this._emit('package:registered', { packageId: pkg.id, pkg })
    this._log('INFO', `Package "${pkg.id}" v${pkg.version || '1.0.0'} registered`)

    if (pkg.extensions && pkg.extensions.length > 0) {
      pkg.extensions.forEach(ext => {
        this.register(pkg.id, ext)
      })
    }
    return this
  }

  register(packageId, extension) {
    if (!extension || !extension.point) {
      throw new Error('Extension must specify a "point" property')
    }
    if (!this._points[extension.point]) {
      throw new ExtensionPointNotFoundError(extension.point)
    }

    const pointName = extension.point
    const pointConfig = this._points[pointName]
    const extId = extension.id || `${packageId}::${pointName}::${Date.now()}`
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

        this._conflicts.push(conflictRecord)
        if (this._options.onConflict) {
          this._options.onConflict(conflictRecord)
        }
      }

      this._emit('conflict:detected', conflictRecord)
    }
  }

  _resolveByReplacement(pointName, existingExt, newExt) {
    const list = this._extensions[pointName]
    const idx = list.findIndex(e => e.id === existingExt.id)
    if (idx !== -1) {
      existingExt.state = EXTENSION_STATES.DISABLED
      this._extensions[pointName].splice(idx, 1, newExt)
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
      this._extensions[pointName].splice(idx, 1, merged)
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
    return this._points[name] || null
  }

  getPoints() {
    return Object.values(this._points)
  }

  getExtensions(pointName) {
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
    return this._packages[packageId] || null
  }

  getPackages() {
    return Object.values(this._packages)
  }

  getConflicts(options = {}) {
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
          })
        }
      }
    }

    impacts.canInstall = impacts.conflicts.filter(
      c => c.resolution === 'throw'
    ).length === 0

    return impacts
  }

  getStats() {
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

  reset() {
    for (const key of Object.keys(this._points)) {
      delete this._points[key]
    }
    for (const key of Object.keys(this._extensions)) {
      delete this._extensions[key]
    }
    for (const key of Object.keys(this._packages)) {
      delete this._packages[key]
    }
    this._conflicts.splice(0, this._conflicts.length)
    this._log('INFO', 'ExtensionPointManager reset')
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

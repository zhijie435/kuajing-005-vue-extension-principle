import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/extension'
import { useExtensionManager, EXTENSION_STATES } from '../plugin'

function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function camelToSnake(str) {
  return str.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
}

function transformKeys(obj, transform) {
  if (Array.isArray(obj)) {
    return obj.map(item => transformKeys(item, transform))
  }
  if (obj && typeof obj === 'object' && obj.constructor === Object) {
    const result = {}
    for (const key of Object.keys(obj)) {
      result[transform(key)] = transformKeys(obj[key], transform)
    }
    return result
  }
  return obj
}

function backendPointToManager(pointFromBackend) {
  return {
    name: pointFromBackend.name,
    description: pointFromBackend.description,
    strategy: pointFromBackend.strategy,
    multiple: pointFromBackend.multiple,
    required: pointFromBackend.required,
    metadata: pointFromBackend.metadata,
  }
}

function backendPackageToManager(pkgFromBackend, allExtensions) {
  const pkgExtensions = allExtensions
    .filter(e => e.package_id === pkgFromBackend.package_id)
    .map(backendExtensionToManager)
  return {
    id: pkgFromBackend.package_id,
    name: pkgFromBackend.name,
    version: pkgFromBackend.version,
    description: pkgFromBackend.description,
    extensions: pkgExtensions,
    enabled: pkgFromBackend.enabled,
  }
}

function backendExtensionToManager(extFromBackend) {
  return {
    id: extFromBackend.ext_id,
    point: extFromBackend.point_name,
    packageId: extFromBackend.package_id,
    component: extFromBackend.component,
    props: extFromBackend.props,
    order: extFromBackend.order,
    priority: extFromBackend.priority,
    override: extFromBackend.is_override,
    overrideTargets: extFromBackend.override_targets || [],
    metadata: extFromBackend.metadata,
    state: extFromBackend.state,
  }
}

export const useExtensionStore = defineStore('extension', () => {
  const manager = useExtensionManager()

  const points = ref([])
  const packages = ref([])
  const extensions = ref([])
  const conflicts = ref([])
  const rollbacks = ref([])
  const stats = ref({ points: 0, extensions: 0, active: 0, packages: 0, conflicts: 0, unresolved: 0 })
  const loading = ref(false)
  const validating = ref(false)
  const rollingBack = ref(false)
  const error = ref(null)
  const lastValidation = ref(null)

  const unresolvedConflicts = computed(() => conflicts.value.filter(c => !c.resolved))
  const activeExtensions = computed(() => extensions.value.filter(e => e.state === EXTENSION_STATES.ACTIVE))
  const pointsByName = computed(() => {
    const map = {}
    points.value.forEach(p => { map[p.name] = p })
    return map
  })

  function syncManagerFromStore() {
    manager.reset()
    for (const point of points.value) {
      manager.definePoint(point.name, backendPointToManager(point))
    }

    const packageExtensionMap = {}
    for (const ext of extensions.value) {
      const pid = ext.package_id
      if (!packageExtensionMap[pid]) {
        packageExtensionMap[pid] = []
      }
      packageExtensionMap[pid].push(ext)
    }

    for (const pkg of packages.value) {
      const pkgExts = (packageExtensionMap[pkg.package_id] || [])
        .filter(e => e.state !== EXTENSION_STATES.DISABLED)
        .map(backendExtensionToManager)

      const pkgData = {
        id: pkg.package_id,
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        extensions: pkgExts,
        enabled: pkg.enabled,
      }
      try {
        manager.registerPackage(pkgData)
      } catch (e) {
        console.warn(`[Store] Failed to sync package ${pkg.package_id} to manager:`, e.message)
      }
    }
  }

  async function fetchStats() {
    try {
      stats.value = await api.getStats()
    } catch (e) {
      console.error('Failed to fetch stats:', e)
    }
  }

  async function fetchPoints() {
    loading.value = true
    error.value = null
    try {
      points.value = await api.getPoints()
      syncManagerFromStore()
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function definePoint(data) {
    error.value = null
    try {
      const point = await api.definePoint(data)
      const existingIdx = points.value.findIndex(p => p.name === point.name)
      if (existingIdx !== -1) {
        points.value[existingIdx] = point
      } else {
        points.value.push(point)
      }
      manager.definePoint(point.name, backendPointToManager(point))
      await fetchStats()
      return point
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function deletePoint(name) {
    error.value = null
    try {
      await api.deletePoint(name)
      points.value = points.value.filter(p => p.name !== name)
      extensions.value = extensions.value.filter(e => e.point_name !== name)
      conflicts.value = conflicts.value.filter(c => c.point_name !== name)
      manager.removePoint(name)
      await fetchStats()
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function fetchPackages() {
    loading.value = true
    error.value = null
    try {
      packages.value = await api.getPackages()
      syncManagerFromStore()
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function registerPackage(data) {
    error.value = null
    try {
      const pkg = await api.registerPackage(data)
      const existingIdx = packages.value.findIndex(p => p.package_id === pkg.package_id)
      if (existingIdx !== -1) {
        packages.value[existingIdx] = pkg
      } else {
        packages.value.push(pkg)
      }
      const pkgExts = (data.extensions || []).map(e => ({
        ...e,
        package_id: pkg.package_id,
      }))
      const freshAll = await api.getExtensions()
      extensions.value = freshAll
      syncManagerFromStore()
      await fetchStats()
      await fetchConflicts()
      return pkg
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function deletePackage(id) {
    error.value = null
    try {
      await api.deletePackage(id)
      packages.value = packages.value.filter(p => p.package_id !== id)
      const removedExts = extensions.value.filter(e => e.package_id === id)
      extensions.value = extensions.value.filter(e => e.package_id !== id)
      conflicts.value = conflicts.value.filter(
        c => c.existing_package_id !== id && c.incoming_package_id !== id
      )
      for (const ext of removedExts) {
        try { manager.unregister(ext.ext_id) } catch (_) {}
      }
      await fetchStats()
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function fetchExtensions(pointName) {
    loading.value = true
    error.value = null
    try {
      const fresh = await api.getExtensions(pointName)
      if (pointName) {
        extensions.value = extensions.value.filter(e => e.point_name !== pointName).concat(fresh)
      } else {
        extensions.value = fresh
      }
      syncManagerFromStore()
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  async function registerExtension(packageId, data) {
    error.value = null
    try {
      const result = await api.registerExtension(packageId, data)
      const fresh = await api.getExtensions()
      extensions.value = fresh
      await fetchStats()
      await fetchConflicts()
      syncManagerFromStore()
      return result
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function unregisterExtension(extId) {
    error.value = null
    try {
      await api.unregisterExtension(extId)
      extensions.value = extensions.value.filter(e => e.ext_id !== extId)
      manager.unregister(extId)
      await fetchStats()
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function fetchConflicts(pointName) {
    try {
      const params = pointName ? `point=${pointName}` : ''
      conflicts.value = await api.getConflicts(params)
    } catch (e) {
      console.error('Failed to fetch conflicts:', e)
    }
  }

  async function resolveConflict(id, resolution) {
    error.value = null
    try {
      const resolved = await api.resolveConflict(id, resolution)
      const idx = conflicts.value.findIndex(c => c.id === id)
      if (idx !== -1) conflicts.value[idx] = resolved
      const fresh = await api.getExtensions()
      extensions.value = fresh
      await fetchStats()
      syncManagerFromStore()
      return resolved
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function checkOverrideImpact(packageId) {
    try {
      return await api.checkOverrideImpact(packageId)
    } catch (e) {
      error.value = e.message
      throw e
    }
  }

  async function validatePackage(data) {
    validating.value = true
    error.value = null
    try {
      const result = await api.validatePackage(data)
      lastValidation.value = result
      return result
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      validating.value = false
    }
  }

  async function rollbackPackage(id) {
    rollingBack.value = true
    error.value = null
    try {
      const result = await api.rollbackPackage(id)
      packages.value = packages.value.filter(p => p.package_id !== id)
      extensions.value = extensions.value.filter(e => e.package_id !== id)
      conflicts.value = conflicts.value.filter(
        c => c.existing_package_id !== id && c.incoming_package_id !== id
      )
      manager.rollbackPackage(id)
      await fetchStats()
      await fetchConflicts()
      await fetchRollbacks()
      return result
    } catch (e) {
      error.value = e.message
      throw e
    } finally {
      rollingBack.value = false
    }
  }

  async function fetchRollbacks(packageId) {
    try {
      rollbacks.value = await api.getRollbacks(packageId)
    } catch (e) {
      console.error('Failed to fetch rollbacks:', e)
    }
  }

  async function init() {
    loading.value = true
    try {
      const [s, p, pk, e, c] = await Promise.all([
        api.getStats(),
        api.getPoints(),
        api.getPackages(),
        api.getExtensions(),
        api.getConflicts(),
      ])
      stats.value = s
      points.value = p
      packages.value = pk
      extensions.value = e
      conflicts.value = c
      syncManagerFromStore()
    } catch (e) {
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  return {
    points, packages, extensions, conflicts, stats, loading, error,
    unresolvedConflicts, activeExtensions, pointsByName,
    fetchStats, fetchPoints, definePoint, deletePoint,
    fetchPackages, registerPackage, deletePackage,
    fetchExtensions, registerExtension, unregisterExtension,
    fetchConflicts, resolveConflict, checkOverrideImpact,
    syncManagerFromStore,
    init,
  }
})

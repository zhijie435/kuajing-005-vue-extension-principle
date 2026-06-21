import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '../api/extension'
import { useExtensionManager, OVERRIDE_STRATEGIES, EXTENSION_STATES } from '../plugin'

export const useExtensionStore = defineStore('extension', () => {
  const manager = useExtensionManager()

  const points = ref([])
  const packages = ref([])
  const extensions = ref([])
  const conflicts = ref([])
  const stats = ref({ points: 0, extensions: 0, active: 0, packages: 0, conflicts: 0, unresolved: 0 })
  const loading = ref(false)
  const error = ref(null)

  const unresolvedConflicts = computed(() => conflicts.value.filter(c => !c.resolved))
  const activeExtensions = computed(() => extensions.value.filter(e => e.state === EXTENSION_STATES.ACTIVE))
  const pointsByName = computed(() => {
    const map = {}
    points.value.forEach(p => { map[p.name] = p })
    return map
  })

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
      points.value.push(point)
      manager.definePoint(data.name, data)
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
      packages.value.push(pkg)
      manager.registerPackage(data)
      await fetchStats()
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
      extensions.value = await api.getExtensions(pointName)
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
      if (result.extension) {
        extensions.value.push(result.extension)
      }
      if (result.conflicts?.length) {
        conflicts.value.push(...result.conflicts)
      }
      await fetchStats()
      await fetchConflicts()
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
      await fetchStats()
      await fetchExtensions()
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
    init,
  }
})

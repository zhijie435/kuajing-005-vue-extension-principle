import { ref, computed, onUnmounted, getCurrentInstance } from 'vue'
import { useExtensionManager } from './ExtensionPointManager'
import { EXTENSION_STATES } from './constants'

export function useExtensionPoint(pointName, options = {}) {
  const manager = options.manager || useExtensionManager()
  const context = ref(options.context || {})

  if (!manager.getPoint(pointName) && options.define !== false) {
    manager.definePoint(pointName, {
      strategy: options.strategy,
      multiple: options.multiple,
      required: options.required,
      description: options.description,
      validator: options.validator,
    })
  }

  const extensions = computed(() => {
    return manager.resolve(pointName, context.value)
  })

  const hasExtensions = computed(() => extensions.value.length > 0)

  const activeExtensions = computed(() => {
    return manager.getExtensions(pointName).filter(e => e.state === EXTENSION_STATES.ACTIVE)
  })

  function register(extension) {
    return manager.register(
      options.packageId || '__anonymous__',
      { point: pointName, ...extension }
    )
  }

  function unregister(extensionId) {
    return manager.unregister(extensionId, pointName)
  }

  function setContext(newContext) {
    context.value = { ...newContext }
  }

  return {
    extensions,
    hasExtensions,
    activeExtensions,
    register,
    unregister,
    setContext,
    pointName,
  }
}

export function useExtension(packageId, extensionDef) {
  const manager = useExtensionManager()
  const registered = ref(null)

  function doRegister() {
    try {
      registered.value = manager.register(packageId, extensionDef)
    } catch (e) {
      console.error(`Failed to register extension on "${extensionDef.point}":`, e)
      registered.value = null
    }
  }

  function doUnregister() {
    if (registered.value) {
      manager.unregister(registered.value.id, extensionDef.point)
      registered.value = null
    }
  }

  if (getCurrentInstance()) {
    doRegister()
    onUnmounted(() => doUnregister())
  } else {
    doRegister()
  }

  return {
    registered,
    unregister: doUnregister,
    reregister() {
      doUnregister()
      doRegister()
    },
  }
}

export function useOverrideChecker(packageId, options = {}) {
  const manager = options.manager || useExtensionManager()

  const impact = computed(() => {
    return manager.checkOverrideImpact(packageId)
  })

  const canInstall = computed(() => impact.value.canInstall)
  const conflicts = computed(() => impact.value.conflicts)
  const warnings = computed(() => impact.value.warnings)
  const hasConflicts = computed(() => conflicts.value.length > 0)

  function forceRegister() {
    const pkg = manager.getPackage(packageId)
    if (!pkg) return
    return manager.registerPackage(pkg)
  }

  return {
    impact,
    canInstall,
    conflicts,
    warnings,
    hasConflicts,
    forceRegister,
  }
}

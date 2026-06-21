import { ExtensionPoint, ExtensionSlot, provideExtensionManager, EXTENSION_MANAGER_KEY } from './ExtensionPointComponent'
import { createExtensionManager, useExtensionManager, ExtensionPointManager } from './ExtensionPointManager'
import { useExtensionPoint, useExtension, useOverrideChecker } from './composables'
import { OVERRIDE_STRATEGIES, EXTENSION_STATES, OverrideConflictError, ExtensionPointNotFoundError, DuplicateExtensionError } from './constants'

export function createExtensionPlugin(options = {}) {
  const manager = options.manager || createExtensionManager(options)

  if (options.extensionPoints) {
    Object.entries(options.extensionPoints).forEach(([name, config]) => {
      manager.definePoint(name, config)
    })
  }

  if (options.packages) {
    Object.values(options.packages).forEach(pkg => {
      manager.registerPackage(pkg)
    })
  }

  const plugin = {
    install(app) {
      app.provide(EXTENSION_MANAGER_KEY, manager)
      app.config.globalProperties.$ext = manager

      app.component('ExtensionPoint', ExtensionPoint)
      app.component('ExtensionSlot', ExtensionSlot)

      app.config.globalProperties.$definePoint = manager.definePoint.bind(manager)
      app.config.globalProperties.$registerExtension = manager.register.bind(manager)
      app.config.globalProperties.$resolveExtensions = manager.resolve.bind(manager)
    },
  }

  return { plugin, manager }
}

export {
  ExtensionPoint,
  ExtensionSlot,
  provideExtensionManager,
  createExtensionManager,
  useExtensionManager,
  ExtensionPointManager,
  useExtensionPoint,
  useExtension,
  useOverrideChecker,
  OVERRIDE_STRATEGIES,
  EXTENSION_STATES,
  OverrideConflictError,
  ExtensionPointNotFoundError,
  DuplicateExtensionError,
}

export default createExtensionPlugin

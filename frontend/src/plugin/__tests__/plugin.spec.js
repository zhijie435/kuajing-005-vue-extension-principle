import { describe, it, expect } from 'vitest'
import { createApp, defineComponent } from 'vue'
import { createExtensionPlugin, createExtensionManager } from '../index'
import { OVERRIDE_STRATEGIES } from '../constants'

describe('createExtensionPlugin', () => {
  it('应该返回 plugin 和 manager', () => {
    const { plugin, manager } = createExtensionPlugin()
    expect(plugin).toBeTruthy()
    expect(plugin.install).toBeTypeOf('function')
    expect(manager).toBeTruthy()
  })

  it('应该使用传入的 manager', () => {
    const customManager = createExtensionManager()
    const { manager } = createExtensionPlugin({ manager: customManager })
    expect(manager).toBe(customManager)
  })

  it('应该初始化扩展点配置', () => {
    const { manager } = createExtensionPlugin({
      extensionPoints: {
        'test.point': {
          description: '测试扩展点',
          strategy: OVERRIDE_STRATEGIES.FIRST_WINS,
        },
      },
    })

    const point = manager.getPoint('test.point')
    expect(point).toBeTruthy()
    expect(point.description).toBe('测试扩展点')
    expect(point.strategy).toBe(OVERRIDE_STRATEGIES.FIRST_WINS)
  })

  it('应该初始化扩展包', () => {
    const { manager } = createExtensionPlugin({
      extensionPoints: {
        'test.point': {},
      },
      packages: {
        'test-pkg': {
          id: 'test-pkg',
          name: '测试包',
          extensions: [
            { point: 'test.point', id: 'ext1' },
          ],
        },
      },
    })

    expect(manager.getPackage('test-pkg')).toBeTruthy()
    expect(manager.getExtensions('test.point')).toHaveLength(1)
  })

  it('install 应该提供 manager 到 app', () => {
    const { plugin, manager } = createExtensionPlugin()
    const app = createApp(defineComponent({ template: '<div></div>' }))

    app.use(plugin)

    expect(app.config.globalProperties.$ext).toBe(manager)
    expect(app.config.globalProperties.$definePoint).toBeTypeOf('function')
    expect(app.config.globalProperties.$registerExtension).toBeTypeOf('function')
    expect(app.config.globalProperties.$resolveExtensions).toBeTypeOf('function')
  })

  it('install 应该注册全局组件', () => {
    const { plugin } = createExtensionPlugin()
    const app = createApp(defineComponent({ template: '<div></div>' }))

    app.use(plugin)

    expect(app.component('ExtensionPoint')).toBeTruthy()
    expect(app.component('ExtensionSlot')).toBeTruthy()
  })
})

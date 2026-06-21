import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ExtensionPointManager, createExtensionManager, useExtensionManager } from '../ExtensionPointManager'
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
} from '../constants'

describe('ExtensionPointManager - 扩展点管理', () => {
  let manager

  beforeEach(() => {
    manager = new ExtensionPointManager()
  })

  describe('definePoint', () => {
    it('应该成功定义一个扩展点', () => {
      manager.definePoint('crm.customer.detail', {
        description: '客户详情扩展点',
        strategy: OVERRIDE_STRATEGIES.LAST_WINS,
      })

      const point = manager.getPoint('crm.customer.detail')
      expect(point).toBeTruthy()
      expect(point.name).toBe('crm.customer.detail')
      expect(point.description).toBe('客户详情扩展点')
      expect(point.strategy).toBe(OVERRIDE_STRATEGIES.LAST_WINS)
      expect(point.multiple).toBe(true)
      expect(point.createdAt).toBeTruthy()
    })

    it('应该默认 multiple 为 true', () => {
      manager.definePoint('test.point')
      expect(manager.getPoint('test.point').multiple).toBe(true)
    })

    it('应该支持设置 multiple 为 false', () => {
      manager.definePoint('test.point', { multiple: false })
      expect(manager.getPoint('test.point').multiple).toBe(false)
    })

    it('应该使用默认策略', () => {
      manager.definePoint('test.point')
      expect(manager.getPoint('test.point').strategy).toBe(OVERRIDE_STRATEGIES.LAST_WINS)
    })

    it('重定义扩展点应该发出警告', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      manager.definePoint('test.point')
      manager.definePoint('test.point')
      expect(warnSpy).toHaveBeenCalled()
      warnSpy.mockRestore()
    })

    it('无效的扩展点名称应该抛出错误', () => {
      expect(() => manager.definePoint('')).toThrow()
      expect(() => manager.definePoint('123invalid')).toThrow()
    })

    it('无效的策略应该抛出错误', () => {
      expect(() => manager.definePoint('test.point', { strategy: 'invalid' })).toThrow()
    })

    it('应该支持链式调用', () => {
      const result = manager.definePoint('test.point')
      expect(result).toBe(manager)
    })
  })

  describe('removePoint', () => {
    it('应该成功删除扩展点', () => {
      manager.definePoint('test.point')
      expect(manager.getPoint('test.point')).toBeTruthy()

      manager.removePoint('test.point')
      expect(manager.getPoint('test.point')).toBeNull()
    })

    it('删除不存在的扩展点应该静默返回', () => {
      expect(() => manager.removePoint('nonexistent')).not.toThrow()
    })

    it('删除扩展点应该同时删除其扩展', () => {
      manager.definePoint('test.point')
      manager.register('pkg1', { point: 'test.point', id: 'ext1' })
      expect(manager.getExtensions('test.point')).toHaveLength(1)

      manager.removePoint('test.point')
      expect(manager.getExtensions('test.point')).toEqual([])
    })

    it('应该支持链式调用', () => {
      manager.definePoint('test.point')
      const result = manager.removePoint('test.point')
      expect(result).toBe(manager)
    })
  })

  describe('getPoint / getPoints', () => {
    it('getPoint 应该返回 null 当扩展点不存在时', () => {
      expect(manager.getPoint('nonexistent')).toBeNull()
    })

    it('getPoints 应该返回所有扩展点', () => {
      manager.definePoint('point.a')
      manager.definePoint('point.b')
      manager.definePoint('point.c')

      const points = manager.getPoints()
      expect(points).toHaveLength(3)
      expect(points.map(p => p.name).sort()).toEqual(['point.a', 'point.b', 'point.c'].sort())
    })
  })
})

describe('ExtensionPointManager - 扩展注册与状态', () => {
  let manager

  beforeEach(() => {
    manager = new ExtensionPointManager()
    manager.definePoint('test.point')
  })

  describe('register', () => {
    it('应该成功注册扩展', () => {
      const ext = manager.register('pkg1', {
        point: 'test.point',
        id: 'ext1',
        component: {},
        props: { color: 'red' },
      })

      expect(ext).toBeTruthy()
      expect(ext.id).toBe('ext1')
      expect(ext.point).toBe('test.point')
      expect(ext.packageId).toBe('pkg1')
      expect(ext.state).toBe(EXTENSION_STATES.ACTIVE)
      expect(ext.props.color).toBe('red')
    })

    it('状态闭环: REGISTERED -> ACTIVE', () => {
      const ext = manager.register('pkg1', {
        point: 'test.point',
        id: 'ext1',
      })
      expect(ext.state).toBe(EXTENSION_STATES.ACTIVE)
    })

    it('未指定 id 时应该自动生成', () => {
      const ext = manager.register('pkg1', { point: 'test.point' })
      expect(ext.id).toBeTruthy()
      expect(ext.id).toContain('pkg1')
      expect(ext.id).toContain('test.point')
    })

    it('应该默认 order 为 100，priority 为 0', () => {
      const ext = manager.register('pkg1', {
        point: 'test.point',
        id: 'ext1',
      })
      expect(ext.order).toBe(100)
      expect(ext.priority).toBe(0)
    })

    it('重复注册相同 id 应该抛出 DuplicateExtensionError', () => {
      manager.register('pkg1', { point: 'test.point', id: 'ext1' })

      expect(() => {
        manager.register('pkg2', { point: 'test.point', id: 'ext1' })
      }).toThrow(DuplicateExtensionError)
    })

    it('注册到不存在的扩展点应该抛出 ExtensionPointNotFoundError', () => {
      expect(() => {
        manager.register('pkg1', { point: 'nonexistent.point', id: 'ext1' })
      }).toThrow(ExtensionPointNotFoundError)
    })

    it('无效的扩展 id 应该抛出错误', () => {
      expect(() => {
        manager.register('pkg1', { point: 'test.point', id: 123 })
      }).toThrow()
    })

    it('扩展点验证器应该被调用', () => {
      const validator = vi.fn(() => true)
      manager.definePoint('validated.point', { validator })

      manager.register('pkg1', { point: 'validated.point', id: 'ext1' })

      expect(validator).toHaveBeenCalled()
    })

    it('验证失败应该抛出错误', () => {
      manager.definePoint('validated.point', {
        validator: () => false,
      })

      expect(() => {
        manager.register('pkg1', { point: 'validated.point', id: 'ext1' })
      }).toThrow()
    })
  })

  describe('unregister', () => {
    it('应该成功注销扩展', () => {
      manager.register('pkg1', { point: 'test.point', id: 'ext1' })
      expect(manager.getExtensions('test.point')).toHaveLength(1)

      const result = manager.unregister('ext1', 'test.point')
      expect(result).toBe(true)
      expect(manager.getExtensions('test.point')).toHaveLength(0)
    })

    it('不指定 pointName 也应该能找到并注销', () => {
      manager.register('pkg1', { point: 'test.point', id: 'ext1' })

      const result = manager.unregister('ext1')
      expect(result).toBe(true)
      expect(manager.getExtensions('test.point')).toHaveLength(0)
    })

    it('注销不存在的扩展应该返回 false', () => {
      expect(manager.unregister('nonexistent', 'test.point')).toBe(false)
    })
  })

  describe('resolve / resolveComponent', () => {
    beforeEach(() => {
      manager.register('pkg1', {
        point: 'test.point',
        id: 'ext1',
        component: { name: 'Comp1' },
        props: { key: 'value1' },
        priority: 1,
        order: 10,
      })
      manager.register('pkg2', {
        point: 'test.point',
        id: 'ext2',
        component: { name: 'Comp2' },
        props: { key: 'value2' },
        priority: 2,
        order: 20,
      })
    })

    it('resolve 应该返回所有活跃扩展', () => {
      const resolved = manager.resolve('test.point')
      expect(resolved).toHaveLength(2)
    })

    it('resolve 应该只返回 ACTIVE 状态的扩展', () => {
      const resolved = manager.resolve('test.point')
      resolved.forEach(ext => {
        expect(ext.state).toBeUndefined()
      })
    })

    it('resolve 应该按 priority 和 order 排序', () => {
      const resolved = manager.resolve('test.point')
      expect(resolved[0].id).toBe('ext2')
      expect(resolved[1].id).toBe('ext1')
    })

    it('resolve 应该合并 context 到 props', () => {
      const resolved = manager.resolve('test.point', { extra: 'data' })
      expect(resolved[0].props.extra).toBe('data')
      expect(resolved[0].props.key).toBe('value2')
    })

    it('resolveComponent 单扩展模式应该返回第一个', () => {
      manager.definePoint('single.point', { multiple: false })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })

      const resolved = manager.resolveComponent('single.point')
      expect(Array.isArray(resolved)).toBe(false)
      expect(resolved.id).toBe('ext1')
    })

    it('resolveComponent 多扩展模式应该返回数组', () => {
      const resolved = manager.resolveComponent('test.point')
      expect(Array.isArray(resolved)).toBe(true)
      expect(resolved).toHaveLength(2)
    })

    it('resolve 不存在的扩展点应该抛出错误', () => {
      expect(() => manager.resolve('nonexistent')).toThrow(ExtensionPointNotFoundError)
    })
  })
})

describe('ExtensionPointManager - 扩展包注册与验证', () => {
  let manager

  beforeEach(() => {
    manager = new ExtensionPointManager()
    manager.definePoint('test.point.a')
    manager.definePoint('test.point.b')
  })

  describe('validatePackageRegistration', () => {
    it('应该验证合法的扩展包', () => {
      const result = manager.validatePackageRegistration({
        id: 'test-pkg',
        name: '测试扩展包',
        version: '1.0.0',
        extensions: [
          { point: 'test.point.a', id: 'ext1' },
          { point: 'test.point.b', id: 'ext2' },
        ],
      })

      expect(result.valid).toBe(true)
      expect(result.canInstall).toBe(true)
      expect(result.extensionValidations).toHaveLength(2)
    })

    it('空包 id 应该返回无效', () => {
      const result = manager.validatePackageRegistration({ id: '', name: 'Test' })
      expect(result.valid).toBe(false)
      expect(result.canInstall).toBe(false)
    })

    it('空包名应该返回无效', () => {
      const result = manager.validatePackageRegistration({ id: 'test-pkg', name: '' })
      expect(result.valid).toBe(false)
    })

    it('无效的版本号应该返回无效', () => {
      const result = manager.validatePackageRegistration({
        id: 'test-pkg',
        name: 'Test',
        version: 'invalid',
      })
      expect(result.valid).toBe(false)
    })

    it('extensions 非数组应该返回无效', () => {
      const result = manager.validatePackageRegistration({
        id: 'test-pkg',
        name: 'Test',
        extensions: 'not-an-array',
      })
      expect(result.valid).toBe(false)
    })

    it('扩展定义到未定义的扩展点应该产生警告', () => {
      const result = manager.validatePackageRegistration({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'undefined.point', id: 'ext1' }],
      })

      expect(result.valid).toBe(true)
      expect(result.warnings.length).toBeGreaterThan(0)
      expect(result.warnings[0].type).toBe('missing_point')
    })

    it('覆盖扩展没有 overrideTargets 应该返回无效', () => {
      const result = manager.validatePackageRegistration({
        id: 'test-pkg',
        name: 'Test',
        extensions: [
          { point: 'test.point.a', id: 'ext1', override: true, overrideTargets: [] },
        ],
      })

      expect(result.valid).toBe(false)
    })

    it('应该检测单扩展模式冲突', () => {
      manager.definePoint('single.point', { multiple: false, strategy: OVERRIDE_STRATEGIES.THROW })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })

      const result = manager.validatePackageRegistration({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'single.point', id: 'ext2' }],
      })

      expect(result.conflicts.length).toBeGreaterThan(0)
      expect(result.canInstall).toBe(false)
    })

    it('应该发出 package:validated 事件', () => {
      const handler = vi.fn()
      manager.on('package:validated', handler)

      manager.validatePackageRegistration({
        id: 'test-pkg',
        name: 'Test',
        extensions: [],
      })

      expect(handler).toHaveBeenCalled()
      expect(handler.mock.calls[0][0].packageId).toBe('test-pkg')
    })
  })

  describe('registerPackage', () => {
    it('应该成功注册扩展包及其所有扩展', () => {
      const result = manager.registerPackage({
        id: 'test-pkg',
        name: '测试包',
        version: '1.0.0',
        extensions: [
          { point: 'test.point.a', id: 'ext1' },
          { point: 'test.point.b', id: 'ext2' },
        ],
      })

      expect(result.success).toBe(true)
      expect(result.registeredExtensions).toHaveLength(2)
      expect(manager.getPackage('test-pkg')).toBeTruthy()
      expect(manager.getExtensions('test.point.a')).toHaveLength(1)
      expect(manager.getExtensions('test.point.b')).toHaveLength(1)
    })

    it('空包 id 应该抛出错误', () => {
      expect(() => manager.registerPackage({ id: '' })).toThrow()
    })

    it('部分失败应该抛出 PartialRegistrationError', () => {
      expect(() => {
        manager.registerPackage(
          {
            id: 'test-pkg',
            name: 'Test',
            extensions: [
              { point: 'test.point.a', id: 'ext1' },
              { point: 'nonexistent.point', id: 'ext2' },
            ],
          },
          { failOnPartialError: true }
        )
      }).toThrow(PartialRegistrationError)
    })

    it('设置 failOnPartialError=false 时不抛出部分失败错误', () => {
      const result = manager.registerPackage(
        {
          id: 'test-pkg',
          name: 'Test',
          extensions: [
            { point: 'test.point.a', id: 'ext1' },
            { point: 'nonexistent.point', id: 'ext2' },
          ],
        },
        { failOnPartialError: false }
      )

      expect(result.success).toBe(false)
      expect(result.registeredExtensions).toHaveLength(1)
      expect(result.failedExtensions).toHaveLength(1)
    })

    it('重复注册应该更新', () => {
      manager.registerPackage({
        id: 'test-pkg',
        name: '旧名称',
        extensions: [{ point: 'test.point.a', id: 'ext1' }],
      })

      const result = manager.registerPackage({
        id: 'test-pkg',
        name: '新名称',
        extensions: [{ point: 'test.point.a', id: 'ext2' }],
      })

      expect(manager.getPackage('test-pkg').name).toBe('新名称')
    })

    it('应该创建回滚记录', () => {
      manager.registerPackage({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'test.point.a', id: 'ext1' }],
      })

      const rollback = manager.getRollback('test-pkg')
      expect(rollback).toBeTruthy()
      expect(rollback.rolledBack).toBe(false)
      expect(rollback.createdExtensions).toHaveLength(1)
    })

    it('skipRollback=true 时不创建回滚记录', () => {
      manager.registerPackage(
        {
          id: 'test-pkg',
          name: 'Test',
          extensions: [{ point: 'test.point.a', id: 'ext1' }],
        },
        { skipRollback: true }
      )

      expect(manager.getRollback('test-pkg')).toBeNull()
    })
  })

  describe('validateAndRegisterPackage', () => {
    it('验证通过应该成功注册', () => {
      const result = manager.validateAndRegisterPackage({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'test.point.a', id: 'ext1' }],
      })

      expect(result.success).toBe(true)
      expect(result.registered).toBeTruthy()
      expect(result.validation.valid).toBe(true)
    })

    it('验证失败不应该注册', () => {
      const result = manager.validateAndRegisterPackage({
        id: '',
        name: 'Test',
        extensions: [],
      })

      expect(result.success).toBe(false)
      expect(result.validation.valid).toBe(false)
      expect(result.registered).toBeNull()
    })
  })

  describe('getPackage / getPackages', () => {
    it('getPackage 应该返回 null 当包不存在时', () => {
      expect(manager.getPackage('nonexistent')).toBeNull()
    })

    it('getPackages 应该返回所有包', () => {
      manager.registerPackage({ id: 'pkg1', name: '包1', extensions: [] })
      manager.registerPackage({ id: 'pkg2', name: '包2', extensions: [] })

      const pkgs = manager.getPackages()
      expect(pkgs).toHaveLength(2)
    })
  })
})

describe('ExtensionPointManager - 覆盖检查与冲突处理', () => {
  let manager

  beforeEach(() => {
    manager = new ExtensionPointManager()
  })

  describe('显式覆盖 (explicit override)', () => {
    beforeEach(() => {
      manager.definePoint('test.point')
      manager.register('pkg1', {
        point: 'test.point',
        id: 'base-ext',
        component: { name: 'Base' },
        props: { base: true },
      })
    })

    it('显式覆盖应该替换原有扩展', () => {
      const newExt = manager.register('pkg2', {
        point: 'test.point',
        id: 'override-ext',
        override: true,
        overrideTargets: ['base-ext'],
        component: { name: 'Override' },
      })

      const extensions = manager.getExtensions('test.point')
      const activeExts = extensions.filter(e => e.state === EXTENSION_STATES.ACTIVE)

      expect(activeExts).toHaveLength(1)
      expect(activeExts[0].id).toBe('override-ext')

      const disabledExt = extensions.find(e => e.id === 'base-ext')
      expect(disabledExt.state).toBe(EXTENSION_STATES.DISABLED)
    })

    it('覆盖目标不存在应该抛出错误', () => {
      expect(() => {
        manager.register('pkg2', {
          point: 'test.point',
          id: 'bad-override',
          override: true,
          overrideTargets: ['nonexistent'],
        })
      }).toThrow()
    })

    it('覆盖目标必须在 override=true 时提供', () => {
      expect(() => {
        manager.register('pkg2', {
          point: 'test.point',
          id: 'bad-override',
          override: true,
          overrideTargets: [],
        })
      }).toThrow()
    })

    it('应该创建冲突记录标记为已解决', () => {
      manager.register('pkg2', {
        point: 'test.point',
        id: 'override-ext',
        override: true,
        overrideTargets: ['base-ext'],
      })

      const conflicts = manager.getConflicts({ pointName: 'test.point' })
      expect(conflicts.length).toBeGreaterThan(0)
      expect(conflicts[0].resolved).toBe(true)
      expect(conflicts[0].type).toBe('explicit_override')
      expect(conflicts[0].resolution).toBe('incoming_override')
    })
  })

  describe('单扩展模式冲突策略', () => {
    it('THROW 策略应该抛出 OverrideConflictError', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.THROW,
      })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })

      expect(() => {
        manager.register('pkg2', { point: 'single.point', id: 'ext2' })
      }).toThrow(OverrideConflictError)
    })

    it('LAST_WINS 策略应该替换原有扩展', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.LAST_WINS,
      })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })
      manager.register('pkg2', { point: 'single.point', id: 'ext2' })

      const active = manager.getExtensions('single.point').filter(
        e => e.state === EXTENSION_STATES.ACTIVE
      )
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('ext2')

      const disabled = manager.getExtensions('single.point').filter(
        e => e.state === EXTENSION_STATES.DISABLED
      )
      expect(disabled).toHaveLength(1)
      expect(disabled[0].id).toBe('ext1')
    })

    it('FIRST_WINS 策略应该保留原有扩展', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.FIRST_WINS,
      })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })
      manager.register('pkg2', { point: 'single.point', id: 'ext2' })

      const active = manager.getExtensions('single.point').filter(
        e => e.state === EXTENSION_STATES.ACTIVE
      )
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('ext1')

      const conflicted = manager.getExtensions('single.point').filter(
        e => e.state === EXTENSION_STATES.OVERRIDE_CONFLICT
      )
      expect(conflicted).toHaveLength(1)
      expect(conflicted[0].id).toBe('ext2')
    })

    it('MERGE 策略应该合并扩展', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.MERGE,
      })
      manager.register('pkg1', {
        point: 'single.point',
        id: 'ext1',
        props: { a: 1, b: 2 },
        metadata: { meta1: 'val1' },
      })
      manager.register('pkg2', {
        point: 'single.point',
        id: 'ext2',
        props: { b: 3, c: 4 },
        metadata: { meta2: 'val2' },
      })

      const extensions = manager.getExtensions('single.point')
      const active = extensions.filter(e => e.state === EXTENSION_STATES.ACTIVE)

      expect(active).toHaveLength(1)
      expect(active[0].mergedFrom).toEqual(['ext1', 'ext2'])
      expect(active[0].props.a).toBe(1)
      expect(active[0].props.b).toBe(3)
      expect(active[0].props.c).toBe(4)
      expect(active[0].metadata.meta1).toBe('val1')
      expect(active[0].metadata.meta2).toBe('val2')

      const disabled = extensions.filter(e => e.state === EXTENSION_STATES.DISABLED)
      expect(disabled).toHaveLength(1)
    })

    it('STACK 策略应该堆叠所有扩展', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.STACK,
      })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })
      manager.register('pkg2', { point: 'single.point', id: 'ext2' })

      const active = manager.getExtensions('single.point').filter(
        e => e.state === EXTENSION_STATES.ACTIVE
      )
      expect(active).toHaveLength(2)
    })
  })

  describe('checkOverrideImpact', () => {
    it('应该检测单扩展点冲突', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.THROW,
      })
      manager.register('existing-pkg', { point: 'single.point', id: 'ext1' })

      manager.registerPackage({
        id: 'incoming-pkg',
        name: 'Incoming',
        extensions: [{ point: 'single.point', id: 'ext2' }],
      })

      const impact = manager.checkOverrideImpact('incoming-pkg')
      expect(impact.conflicts.length).toBeGreaterThan(0)
      expect(impact.conflicts[0].type).toBe('single_point_conflict')
      expect(impact.canInstall).toBe(false)
    })

    it('应该检测显式覆盖', () => {
      manager.definePoint('test.point')
      manager.register('existing-pkg', { point: 'test.point', id: 'ext1' })

      manager.registerPackage({
        id: 'incoming-pkg',
        name: 'Incoming',
        extensions: [
          {
            point: 'test.point',
            id: 'ext2',
            override: true,
            overrideTargets: ['ext1'],
          },
        ],
      })

      const impact = manager.checkOverrideImpact('incoming-pkg')
      const explicitConflicts = impact.conflicts.filter(c => c.type === 'explicit_override')
      expect(explicitConflicts.length).toBeGreaterThan(0)
      expect(impact.canInstall).toBe(true)
    })

    it('未定义的扩展点应该产生警告', () => {
      manager.registerPackage({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'undefined.point', id: 'ext1' }],
      })

      const impact = manager.checkOverrideImpact('test-pkg')
      expect(impact.warnings.length).toBeGreaterThan(0)
      expect(impact.warnings[0].type).toBe('missing_point')
    })

    it('包不存在时应该返回 canInstall=true', () => {
      const impact = manager.checkOverrideImpact('nonexistent-pkg')
      expect(impact.canInstall).toBe(true)
      expect(impact.conflicts).toEqual([])
    })
  })

  describe('getConflicts', () => {
    it('应该按 pointName 过滤', () => {
      manager.definePoint('point.a')
      manager.definePoint('point.b')
      manager.definePoint('point.c', { multiple: false, strategy: OVERRIDE_STRATEGIES.STACK })

      manager.register('pkg1', { point: 'point.a', id: 'ext1' })
      manager.register('pkg2', { point: 'point.a', id: 'ext2', override: true, overrideTargets: ['ext1'] })

      const conflicts = manager.getConflicts({ pointName: 'point.a' })
      expect(conflicts.every(c => c.pointName === 'point.a')).toBe(true)
    })

    it('应该按 resolved 状态过滤', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.LAST_WINS,
      })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })
      manager.register('pkg2', { point: 'single.point', id: 'ext2' })

      const resolvedConflicts = manager.getConflicts({ resolved: true })
      expect(resolvedConflicts.every(c => c.resolved)).toBe(true)
    })

    it('unresolved 应该只返回未解决的冲突', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.THROW,
      })
      manager.register('pkg1', { point: 'single.point', id: 'ext1' })

      try {
        manager.register('pkg2', { point: 'single.point', id: 'ext2' })
      } catch (e) {
        // 预期错误
      }

      const unresolved = manager.getConflicts({ unresolved: true })
      expect(unresolved.every(c => !c.resolved)).toBe(true)
    })
  })

  describe('onConflict 回调', () => {
    it('检测到冲突时应该调用 onConflict 回调', () => {
      const onConflict = vi.fn()
      const mgr = new ExtensionPointManager({ onConflict })
      mgr.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.LAST_WINS,
      })
      mgr.register('pkg1', { point: 'single.point', id: 'ext1' })
      mgr.register('pkg2', { point: 'single.point', id: 'ext2' })

      expect(onConflict).toHaveBeenCalled()
    })
  })
})

describe('ExtensionPointManager - 状态闭环与回滚', () => {
  let manager

  beforeEach(() => {
    manager = new ExtensionPointManager()
    manager.definePoint('test.point.a')
    manager.definePoint('test.point.b')
  })

  describe('状态流转验证', () => {
    it('新注册扩展状态应该从 REGISTERED 变为 ACTIVE', () => {
      const ext = manager.register('pkg1', {
        point: 'test.point.a',
        id: 'ext1',
      })
      expect(ext.state).toBe(EXTENSION_STATES.ACTIVE)
    })

    it('LAST_WINS 策略下被替换的扩展状态应该变为 DISABLED', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.LAST_WINS,
      })

      const ext1 = manager.register('pkg1', { point: 'single.point', id: 'ext1' })
      expect(ext1.state).toBe(EXTENSION_STATES.ACTIVE)

      manager.register('pkg2', { point: 'single.point', id: 'ext2' })

      const ext1After = manager.getExtensions('single.point').find(e => e.id === 'ext1')
      expect(ext1After.state).toBe(EXTENSION_STATES.DISABLED)
    })

    it('FIRST_WINS 策略下新来的扩展状态应该为 OVERRIDE_CONFLICT', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.FIRST_WINS,
      })

      manager.register('pkg1', { point: 'single.point', id: 'ext1' })
      manager.register('pkg2', { point: 'single.point', id: 'ext2' })

      const ext2 = manager.getExtensions('single.point').find(e => e.id === 'ext2')
      expect(ext2.state).toBe(EXTENSION_STATES.OVERRIDE_CONFLICT)
    })

    it('显式覆盖下被覆盖的扩展状态应该变为 DISABLED', () => {
      manager.register('pkg1', { point: 'test.point.a', id: 'ext1' })
      manager.register('pkg2', {
        point: 'test.point.a',
        id: 'ext2',
        override: true,
        overrideTargets: ['ext1'],
      })

      const ext1 = manager.getExtensions('test.point.a').find(e => e.id === 'ext1')
      expect(ext1.state).toBe(EXTENSION_STATES.DISABLED)

      const ext2 = manager.getExtensions('test.point.a').find(e => e.id === 'ext2')
      expect(ext2.state).toBe(EXTENSION_STATES.ACTIVE)
    })

    it('MERGE 策略下原扩展状态变为 DISABLED，合并后扩展为 ACTIVE', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.MERGE,
      })

      manager.register('pkg1', { point: 'single.point', id: 'ext1' })
      manager.register('pkg2', { point: 'single.point', id: 'ext2' })

      const extensions = manager.getExtensions('single.point')
      const disabled = extensions.filter(e => e.state === EXTENSION_STATES.DISABLED)
      const active = extensions.filter(e => e.state === EXTENSION_STATES.ACTIVE)

      expect(disabled).toHaveLength(1)
      expect(active).toHaveLength(1)
      expect(active[0].mergedFrom).toBeTruthy()
    })
  })

  describe('rollbackPackage', () => {
    it('应该能够回滚一个新注册的包', () => {
      manager.registerPackage({
        id: 'test-pkg',
        name: 'Test',
        extensions: [
          { point: 'test.point.a', id: 'ext1' },
          { point: 'test.point.b', id: 'ext2' },
        ],
      })

      expect(manager.getPackage('test-pkg')).toBeTruthy()
      expect(manager.getExtensions('test.point.a')).toHaveLength(1)
      expect(manager.getExtensions('test.point.b')).toHaveLength(1)

      const result = manager.rollbackPackage('test-pkg')

      expect(result.success).toBe(true)
      expect(result.removedExtensions).toHaveLength(2)
      expect(manager.getPackage('test-pkg')).toBeNull()
      expect(manager.getExtensions('test.point.a')).toHaveLength(0)
      expect(manager.getExtensions('test.point.b')).toHaveLength(0)
    })

    it('回滚应该恢复被禁用的扩展', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.LAST_WINS,
      })

      manager.registerPackage({
        id: 'pkg1',
        name: 'Pkg1',
        extensions: [{ point: 'single.point', id: 'ext1' }],
      })

      manager.registerPackage({
        id: 'pkg2',
        name: 'Pkg2',
        extensions: [{ point: 'single.point', id: 'ext2' }],
      })

      const ext1Before = manager.getExtensions('single.point').find(e => e.id === 'ext1')
      expect(ext1Before.state).toBe(EXTENSION_STATES.DISABLED)

      manager.rollbackPackage('pkg2')

      const ext1After = manager.getExtensions('single.point').find(e => e.id === 'ext1')
      expect(ext1After.state).toBe(EXTENSION_STATES.ACTIVE)

      const ext2After = manager.getExtensions('single.point').find(e => e.id === 'ext2')
      expect(ext2After).toBeUndefined()
    })

    it('回滚应该清理新创建的冲突', () => {
      manager.definePoint('single.point', {
        multiple: false,
        strategy: OVERRIDE_STRATEGIES.LAST_WINS,
      })

      manager.registerPackage({
        id: 'pkg1',
        name: 'Pkg1',
        extensions: [{ point: 'single.point', id: 'ext1' }],
      })

      const conflictsBefore = manager.getConflicts().length

      manager.registerPackage({
        id: 'pkg2',
        name: 'Pkg2',
        extensions: [{ point: 'single.point', id: 'ext2' }],
      })

      const conflictsDuring = manager.getConflicts().length
      expect(conflictsDuring).toBeGreaterThan(conflictsBefore)

      manager.rollbackPackage('pkg2')

      expect(manager.getConflicts().length).toBe(conflictsBefore)
    })

    it('回滚后应该恢复包的先前状态', () => {
      manager.registerPackage({
        id: 'test-pkg',
        name: '原始名称',
        version: '1.0.0',
        extensions: [{ point: 'test.point.a', id: 'ext1' }],
      })

      manager.registerPackage({
        id: 'test-pkg',
        name: '新名称',
        version: '2.0.0',
        extensions: [{ point: 'test.point.a', id: 'ext2' }],
      })

      expect(manager.getPackage('test-pkg').name).toBe('新名称')
      expect(manager.getPackage('test-pkg').version).toBe('2.0.0')

      manager.rollbackPackage('test-pkg')

      expect(manager.getPackage('test-pkg').name).toBe('原始名称')
      expect(manager.getPackage('test-pkg').version).toBe('1.0.0')
    })

    it('没有回滚记录时应该执行简单删除', () => {
      manager.registerPackage(
        {
          id: 'test-pkg',
          name: 'Test',
          extensions: [{ point: 'test.point.a', id: 'ext1' }],
        },
        { skipRollback: true }
      )

      const result = manager.rollbackPackage('test-pkg')
      expect(result.success).toBe(false)
      expect(result.message).toContain('没有可回滚的记录')
      expect(manager.getPackage('test-pkg')).toBeNull()
    })

    it('canRollbackPackage 应该正确判断是否可回滚', () => {
      manager.registerPackage({
        id: 'pkg1',
        name: 'Pkg1',
        extensions: [{ point: 'test.point.a', id: 'ext1' }],
      })

      expect(manager.canRollbackPackage('pkg1')).toBe(true)

      manager.rollbackPackage('pkg1')

      expect(manager.canRollbackPackage('pkg1')).toBe(false)
    })

    it('getRollbacks 应该返回所有回滚记录', () => {
      manager.registerPackage({ id: 'pkg1', name: 'Pkg1', extensions: [] })
      manager.registerPackage({ id: 'pkg2', name: 'Pkg2', extensions: [] })

      const rollbacks = manager.getRollbacks()
      expect(rollbacks).toHaveLength(2)
    })

    it('重复回滚应该标记 rolledBack=true', () => {
      manager.registerPackage({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'test.point.a', id: 'ext1' }],
      })

      manager.rollbackPackage('test-pkg')
      const rollback = manager.getRollback('test-pkg')
      expect(rollback.rolledBack).toBe(true)
      expect(rollback.rolledBackAt).toBeTruthy()
    })
  })

  describe('reset', () => {
    it('应该清除所有数据', () => {
      manager.definePoint('test.point')
      manager.registerPackage({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'test.point', id: 'ext1' }],
      })

      expect(manager.getPoints().length).toBeGreaterThan(0)
      expect(manager.getPackages().length).toBeGreaterThan(0)

      manager.reset()

      expect(manager.getPoints()).toEqual([])
      expect(manager.getPackages()).toEqual([])
      expect(manager.getExtensions()).toEqual([])
      expect(manager.getConflicts()).toEqual([])
      expect(manager.getRollbacks()).toEqual([])
    })

    it('keepRollbacks=true 应该保留回滚记录', () => {
      manager.definePoint('test.point')
      manager.registerPackage({
        id: 'test-pkg',
        name: 'Test',
        extensions: [{ point: 'test.point', id: 'ext1' }],
      })

      manager.reset({ keepRollbacks: true })

      expect(manager.getRollbacks()).toHaveLength(1)
      expect(manager.getPoints()).toEqual([])
    })
  })
})

describe('ExtensionPointManager - 事件系统', () => {
  let manager

  beforeEach(() => {
    manager = new ExtensionPointManager()
    manager.definePoint('test.point')
  })

  it('on 应该注册事件监听器', () => {
    const handler = vi.fn()
    manager.on('point:defined', handler)

    manager.definePoint('new.point')
    expect(handler).toHaveBeenCalled()
  })

  it('on 应该返回取消订阅函数', () => {
    const handler = vi.fn()
    const unsubscribe = manager.on('point:defined', handler)

    unsubscribe()
    manager.definePoint('new.point')

    expect(handler).not.toHaveBeenCalled()
  })

  it('应该支持通配符事件 *', () => {
    const handler = vi.fn()
    manager.on('*', handler)

    manager.definePoint('new.point')
    manager.register('pkg1', { point: 'test.point', id: 'ext1' })

    expect(handler).toHaveBeenCalled()
    expect(handler.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('扩展注册应该触发 extension:registered 事件', () => {
    const handler = vi.fn()
    manager.on('extension:registered', handler)

    manager.register('pkg1', { point: 'test.point', id: 'ext1' })

    expect(handler).toHaveBeenCalled()
    expect(handler.mock.calls[0][0].pointName).toBe('test.point')
    expect(handler.mock.calls[0][0].extension.id).toBe('ext1')
  })

  it('包注册应该触发 package:registered 事件', () => {
    const handler = vi.fn()
    manager.on('package:registered', handler)

    manager.registerPackage({
      id: 'test-pkg',
      name: 'Test',
      extensions: [{ point: 'test.point', id: 'ext1' }],
    })

    expect(handler).toHaveBeenCalled()
    expect(handler.mock.calls[0][0].packageId).toBe('test-pkg')
  })

  it('冲突检测应该触发 conflict:detected 事件', () => {
    manager.definePoint('single.point', {
      multiple: false,
      strategy: OVERRIDE_STRATEGIES.LAST_WINS,
    })
    manager.register('pkg1', { point: 'single.point', id: 'ext1' })

    const handler = vi.fn()
    manager.on('conflict:detected', handler)

    manager.register('pkg2', { point: 'single.point', id: 'ext2' })

    expect(handler).toHaveBeenCalled()
  })

  it('包回滚应该触发 package:rolledback 事件', () => {
    manager.registerPackage({
      id: 'test-pkg',
      name: 'Test',
      extensions: [{ point: 'test.point', id: 'ext1' }],
    })

    const handler = vi.fn()
    manager.on('package:rolledback', handler)

    manager.rollbackPackage('test-pkg')

    expect(handler).toHaveBeenCalled()
    expect(handler.mock.calls[0][0].packageId).toBe('test-pkg')
  })
})

describe('ExtensionPointManager - 权限系统', () => {
  it('默认应该禁用权限检查', () => {
    const manager = new ExtensionPointManager()
    manager.definePoint('test.point')
    expect(() => manager.getPoint('test.point')).not.toThrow()
  })

  it('启用权限检查后应该验证权限', () => {
    const manager = new ExtensionPointManager({
      enablePermissionCheck: true,
      defaultScope: PERMISSION_SCOPES.PUBLIC,
    })

    manager.setScope(PERMISSION_SCOPES.ADMIN)
    manager.definePoint('test.point')
    manager.setScope(PERMISSION_SCOPES.PUBLIC)

    expect(() => manager.getPoint('test.point')).not.toThrow()

    expect(() => manager.getConflicts()).toThrow(PermissionDeniedError)
  })

  it('setScope 应该改变当前权限范围', () => {
    const manager = new ExtensionPointManager({
      enablePermissionCheck: true,
      defaultScope: PERMISSION_SCOPES.PUBLIC,
    })

    manager.setScope(PERMISSION_SCOPES.ADMIN)
    manager.definePoint('test.point')
    manager.setScope(PERMISSION_SCOPES.PUBLIC)

    expect(() => manager.getConflicts()).toThrow(PermissionDeniedError)

    manager.setScope(PERMISSION_SCOPES.INTERNAL)
    expect(() => manager.getConflicts()).not.toThrow()
  })

  it('无效的 scope 应该抛出错误', () => {
    const manager = new ExtensionPointManager()
    expect(() => manager.setScope('invalid')).toThrow()
  })

  it('应该支持自定义 permissionChecker', () => {
    const customChecker = vi.fn((action, scope, options) => {
      if (action === PERMISSION_ACTIONS.READ_POINT) return true
      if (action === PERMISSION_ACTIONS.WRITE_POINT) return true
      if (action === PERMISSION_ACTIONS.READ_EXTENSION) return true
      return 'Custom permission denied'
    })

    const manager = new ExtensionPointManager({
      enablePermissionCheck: true,
      permissionChecker: customChecker,
      defaultScope: PERMISSION_SCOPES.PUBLIC,
    })

    manager.definePoint('test.point')
    expect(manager.getPoint('test.point')).toBeTruthy()

    expect(() => manager.getConflicts()).toThrow(PermissionDeniedError)
    expect(customChecker).toHaveBeenCalled()
  })

  it('应该支持自定义 scopeResolver', () => {
    const scopeResolver = vi.fn(() => PERMISSION_SCOPES.ADMIN)

    const manager = new ExtensionPointManager({
      enablePermissionCheck: true,
      scopeResolver,
      defaultScope: PERMISSION_SCOPES.PUBLIC,
    })

    manager.definePoint('test.point')

    expect(() => manager.getConflicts()).not.toThrow()
    expect(scopeResolver).toHaveBeenCalled()
  })
})

describe('ExtensionPointManager - 统计信息', () => {
  let manager

  beforeEach(() => {
    manager = new ExtensionPointManager()
  })

  it('getStats 应该返回正确的统计数据', () => {
    manager.definePoint('point.a')
    manager.definePoint('point.b')
    manager.definePoint('point.c', {
      multiple: false,
      strategy: OVERRIDE_STRATEGIES.LAST_WINS,
    })

    manager.registerPackage({
      id: 'pkg1',
      name: 'Pkg1',
      extensions: [
        { point: 'point.a', id: 'ext1' },
        { point: 'point.a', id: 'ext2' },
        { point: 'point.c', id: 'ext3' },
      ],
    })

    const stats = manager.getStats()
    expect(stats.points).toBe(3)
    expect(stats.extensions).toBe(3)
    expect(stats.active).toBe(3)
    expect(stats.packages).toBe(1)
    expect(stats.conflicts).toBe(0)
    expect(stats.unresolved).toBe(0)
  })

  it('getStats 应该正确计算 unresolved conflicts', () => {
    manager.definePoint('single.point', {
      multiple: false,
      strategy: OVERRIDE_STRATEGIES.THROW,
    })
    manager.register('pkg1', { point: 'single.point', id: 'ext1' })

    try {
      manager.register('pkg2', { point: 'single.point', id: 'ext2' })
    } catch (e) {
      // 预期错误
    }

    const stats = manager.getStats()
    expect(stats.conflicts).toBe(1)
    expect(stats.unresolved).toBe(1)
  })
})

describe('ExtensionPointManager - 工厂函数', () => {
  it('createExtensionManager 应该创建新实例', () => {
    const manager = createExtensionManager()
    expect(manager).toBeInstanceOf(ExtensionPointManager)
  })

  it('useExtensionManager 应该返回单例', () => {
    const m1 = createExtensionManager()
    const m2 = useExtensionManager()
    expect(m1).toBe(m2)
  })
})

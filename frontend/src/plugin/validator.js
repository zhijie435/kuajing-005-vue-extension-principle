export class ValidationError extends Error {
  constructor(field, message) {
    super(message)
    this.name = 'ValidationError'
    this.field = field
    this.message = message
  }
}

export class ValidationResult {
  constructor() {
    this.errors = []
  }

  addError(field, message) {
    this.errors.push(new ValidationError(field, message))
    return this
  }

  get valid() {
    return this.errors.length === 0
  }

  get firstError() {
    return this.errors[0] || null
  }

  get fieldErrors() {
    const map = {}
    for (const err of this.errors) {
      if (!map[err.field]) map[err.field] = []
      map[err.field].push(err.message)
    }
    return map
  }

  getFieldError(field) {
    const err = this.errors.find(e => e.field === field)
    return err ? err.message : null
  }

  merge(other) {
    this.errors.push(...other.errors)
    return this
  }
}

const DOT_IDENTIFIER_RE = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9]*)+$/
const SINGLE_IDENTIFIER_RE = /^[a-zA-Z][a-zA-Z0-9_\-]*$/
const VERSION_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$/

export function validatePointName(name) {
  const result = new ValidationResult()
  if (!name || typeof name !== 'string') {
    result.addError('name', '扩展点名称不能为空')
    return result
  }
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    result.addError('name', '扩展点名称不能为空白字符')
    return result
  }
  if (trimmed.length > 200) {
    result.addError('name', '扩展点名称不能超过200个字符')
  }
  if (!DOT_IDENTIFIER_RE.test(trimmed) && !SINGLE_IDENTIFIER_RE.test(trimmed)) {
    result.addError('name', '扩展点名称格式无效，应为点分隔标识符（如 crm.customer.detail.action）或单段标识符（如 sidebar）')
  }
  return result
}

export function validatePackageId(id) {
  const result = new ValidationResult()
  if (!id || typeof id !== 'string') {
    result.addError('id', '扩展包ID不能为空')
    return result
  }
  const trimmed = id.trim()
  if (trimmed.length === 0) {
    result.addError('id', '扩展包ID不能为空白字符')
    return result
  }
  if (trimmed.length > 100) {
    result.addError('id', '扩展包ID不能超过100个字符')
  }
  if (!/^[a-zA-Z][a-zA-Z0-9_\-]*(\.[a-zA-Z][a-zA-Z0-9_\-]*)*$/.test(trimmed)) {
    result.addError('id', '扩展包ID格式无效，应为字母开头的点分隔标识符（如 crm-advanced-features）')
  }
  return result
}

export function validatePackageName(name) {
  const result = new ValidationResult()
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    result.addError('name', '扩展包名称不能为空')
    return result
  }
  if (name.trim().length > 200) {
    result.addError('name', '扩展包名称不能超过200个字符')
  }
  return result
}

export function validateVersion(version) {
  const result = new ValidationResult()
  if (!version || typeof version !== 'string') {
    result.addError('version', '版本号不能为空')
    return result
  }
  if (!VERSION_RE.test(version.trim())) {
    result.addError('version', '版本号格式无效，应为 semver 格式（如 1.0.0, 2.1.3-beta.1）')
  }
  return result
}

export function validateExtensionId(id) {
  const result = new ValidationResult()
  if (!id) return result
  if (typeof id !== 'string') {
    result.addError('id', '扩展ID必须为字符串')
    return result
  }
  if (id.trim().length === 0) {
    result.addError('id', '扩展ID不能为空白字符')
  }
  if (id.includes('::') && id.split('::').length !== 3) {
    result.addError('id', '扩展ID的三段式格式应为 packageId::pointName::suffix')
  }
  return result
}

export function validateStrategy(strategy) {
  const result = new ValidationResult()
  const valid = ['throw', 'last_wins', 'first_wins', 'merge', 'stack']
  if (!strategy) {
    result.addError('strategy', '覆盖策略不能为空')
  } else if (!valid.includes(strategy)) {
    result.addError('strategy', `覆盖策略无效，应为: ${valid.join(', ')}`)
  }
  return result
}

export function validateJsonString(jsonStr, field = 'props') {
  const result = new ValidationResult()
  if (!jsonStr || jsonStr.trim().length === 0) return result
  try {
    const parsed = JSON.parse(jsonStr)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      result.addError(field, `${field} 必须是有效的 JSON 对象，不能是数组或基本类型`)
    }
  } catch (e) {
    result.addError(field, `JSON 格式无效: ${e.message.replace(/^JSON\.parse:\s*/, '')}`)
  }
  return result
}

export function validateOverrideTargets(targetsStr, existingExtensions = []) {
  const result = new ValidationResult()
  if (!targetsStr || targetsStr.trim().length === 0) {
    result.addError('overrideTargets', '覆盖目标不能为空（勾选覆盖扩展后必须指定目标）')
    return result
  }
  const targets = targetsStr.split(',').map(s => s.trim()).filter(Boolean)
  if (targets.length === 0) {
    result.addError('overrideTargets', '至少需要一个有效的覆盖目标ID')
    return result
  }
  const existingIds = new Set(existingExtensions.map(e => e.ext_id || e.id))
  for (const target of targets) {
    if (!existingIds.has(target) && existingIds.size > 0) {
      result.addError('overrideTargets', `覆盖目标 "${target}" 不存在于当前已注册的扩展中`)
    }
  }
  return result
}

export function validatePriority(value) {
  const result = new ValidationResult()
  if (value === null || value === undefined || value === '') return result
  const num = Number(value)
  if (isNaN(num)) {
    result.addError('priority', '优先级必须为数字')
  } else if (!Number.isInteger(num)) {
    result.addError('priority', '优先级必须为整数')
  }
  return result
}

export function validateOrder(value) {
  const result = new ValidationResult()
  if (value === null || value === undefined || value === '') return result
  const num = Number(value)
  if (isNaN(num)) {
    result.addError('order', '排序必须为数字')
  } else if (!Number.isInteger(num)) {
    result.addError('order', '排序必须为整数')
  }
  return result
}

export function validatePointDefinition(data) {
  const result = new ValidationResult()
  result.merge(validatePointName(data.name))
  result.merge(validateStrategy(data.strategy))
  return result
}

export function validatePackageRegistration(data) {
  const result = new ValidationResult()
  result.merge(validatePackageId(data.id || data.package_id))
  result.merge(validatePackageName(data.name))
  if (data.version) {
    result.merge(validateVersion(data.version))
  }
  return result
}

export function validateExtensionRegistration(packageId, data, existingExtensions = []) {
  const result = new ValidationResult()
  if (!packageId) {
    result.addError('packageId', '扩展包不能为空')
  }
  if (!data.point) {
    result.addError('point', '扩展点不能为空')
  }
  if (data.id) {
    result.merge(validateExtensionId(data.id))
  }
  result.merge(validatePriority(data.priority))
  result.merge(validateOrder(data.order))
  if (data.override && !data.overrideTargets?.length) {
    result.addError('overrideTargets', '标记为覆盖扩展时，必须指定覆盖目标')
  }
  if (data.override && data.overrideTargets?.length > 0) {
    const existingIds = new Set(existingExtensions.map(e => e.ext_id || e.id))
    for (const target of data.overrideTargets) {
      if (!existingIds.has(target) && existingIds.size > 0) {
        result.addError('overrideTargets', `覆盖目标 "${target}" 不存在于当前已注册的扩展中`)
      }
    }
  }
  return result
}

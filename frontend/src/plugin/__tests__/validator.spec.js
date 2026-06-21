import { describe, it, expect } from 'vitest'
import {
  ValidationError,
  ValidationResult,
  validatePointName,
  validatePackageId,
  validatePackageName,
  validateVersion,
  validateExtensionId,
  validateStrategy,
  validateJsonString,
  validateOverrideTargets,
  validatePriority,
  validateOrder,
  validatePointDefinition,
  validatePackageRegistration,
  validateExtensionRegistration,
} from '../validator'

describe('ValidationError', () => {
  it('should create error with field and message', () => {
    const err = new ValidationError('name', '名称不能为空')
    expect(err.name).toBe('ValidationError')
    expect(err.field).toBe('name')
    expect(err.message).toBe('名称不能为空')
  })
})

describe('ValidationResult', () => {
  it('should start with no errors', () => {
    const result = new ValidationResult()
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.firstError).toBeNull()
  })

  it('should add errors correctly', () => {
    const result = new ValidationResult()
    result.addError('name', '名称错误')
    result.addError('version', '版本错误')

    expect(result.valid).toBe(false)
    expect(result.errors.length).toBe(2)
    expect(result.firstError.field).toBe('name')
    expect(result.firstError.message).toBe('名称错误')
  })

  it('should get field errors map', () => {
    const result = new ValidationResult()
    result.addError('name', '名称错误1')
    result.addError('name', '名称错误2')
    result.addError('version', '版本错误')

    const fieldErrors = result.fieldErrors
    expect(fieldErrors.name).toHaveLength(2)
    expect(fieldErrors.version).toHaveLength(1)
  })

  it('should get error by field', () => {
    const result = new ValidationResult()
    result.addError('name', '名称错误')

    expect(result.getFieldError('name')).toBe('名称错误')
    expect(result.getFieldError('version')).toBeNull()
  })

  it('should merge other results', () => {
    const r1 = new ValidationResult()
    r1.addError('name', '名称错误')

    const r2 = new ValidationResult()
    r2.addError('version', '版本错误')

    r1.merge(r2)
    expect(r1.errors.length).toBe(2)
    expect(r1.valid).toBe(false)
  })
})

describe('validatePointName', () => {
  it('should return invalid for empty name', () => {
    expect(validatePointName('').valid).toBe(false)
    expect(validatePointName(null).valid).toBe(false)
    expect(validatePointName(undefined).valid).toBe(false)
  })

  it('should return invalid for whitespace-only name', () => {
    expect(validatePointName('   ').valid).toBe(false)
  })

  it('should return invalid for too long name', () => {
    const longName = 'a'.repeat(201)
    expect(validatePointName(longName).valid).toBe(false)
  })

  it('should validate single identifier', () => {
    expect(validatePointName('sidebar').valid).toBe(true)
    expect(validatePointName('my_point').valid).toBe(true)
    expect(validatePointName('my-point').valid).toBe(true)
  })

  it('should validate dot-separated identifier', () => {
    expect(validatePointName('crm.customer.detail').valid).toBe(true)
    expect(validatePointName('crm.customer.detail.action').valid).toBe(true)
  })

  it('should reject invalid formats', () => {
    expect(validatePointName('123abc').valid).toBe(false)
    expect(validatePointName('crm..customer').valid).toBe(false)
    expect(validatePointName('.crm.customer').valid).toBe(false)
  })
})

describe('validatePackageId', () => {
  it('should return invalid for empty id', () => {
    expect(validatePackageId('').valid).toBe(false)
    expect(validatePackageId(null).valid).toBe(false)
    expect(validatePackageId(undefined).valid).toBe(false)
  })

  it('should return invalid for whitespace-only id', () => {
    expect(validatePackageId('   ').valid).toBe(false)
  })

  it('should return invalid for too long id', () => {
    const longId = 'a'.repeat(101)
    expect(validatePackageId(longId).valid).toBe(false)
  })

  it('should validate single segment id', () => {
    expect(validatePackageId('crm-advanced').valid).toBe(true)
    expect(validatePackageId('crm_advanced').valid).toBe(true)
  })

  it('should validate dot-separated id', () => {
    expect(validatePackageId('com.example.crm').valid).toBe(true)
  })

  it('should reject invalid formats', () => {
    expect(validatePackageId('123abc').valid).toBe(false)
    expect(validatePackageId('crm..pkg').valid).toBe(false)
  })
})

describe('validatePackageName', () => {
  it('should return invalid for empty name', () => {
    expect(validatePackageName('').valid).toBe(false)
    expect(validatePackageName('   ').valid).toBe(false)
    expect(validatePackageName(null).valid).toBe(false)
  })

  it('should return invalid for too long name', () => {
    const longName = 'a'.repeat(201)
    expect(validatePackageName(longName).valid).toBe(false)
  })

  it('should validate valid names', () => {
    expect(validatePackageName('CRM 高级功能包').valid).toBe(true)
    expect(validatePackageName('Extension Package 1').valid).toBe(true)
  })
})

describe('validateVersion', () => {
  it('should return invalid for empty version', () => {
    expect(validateVersion('').valid).toBe(false)
    expect(validateVersion(null).valid).toBe(false)
  })

  it('should validate semver versions', () => {
    expect(validateVersion('1.0.0').valid).toBe(true)
    expect(validateVersion('2.1.3-beta.1').valid).toBe(true)
    expect(validateVersion('1.0.0+build.123').valid).toBe(true)
    expect(validateVersion('1.0.0-alpha.1+build.123').valid).toBe(true)
  })

  it('should reject invalid versions', () => {
    expect(validateVersion('1.0').valid).toBe(false)
    expect(validateVersion('v1.0.0').valid).toBe(false)
    expect(validateVersion('abc').valid).toBe(false)
  })
})

describe('validateExtensionId', () => {
  it('should return valid for empty/undefined id (optional)', () => {
    expect(validateExtensionId('').valid).toBe(true)
    expect(validateExtensionId(undefined).valid).toBe(true)
  })

  it('should return invalid for non-string id', () => {
    expect(validateExtensionId(123).valid).toBe(false)
  })

  it('should return invalid for whitespace-only id', () => {
    expect(validateExtensionId('   ').valid).toBe(false)
  })

  it('should validate triple-segment format with ::', () => {
    expect(validateExtensionId('pkg::point::suffix').valid).toBe(true)
  })

  it('should reject wrong number of :: segments', () => {
    expect(validateExtensionId('pkg::point').valid).toBe(false)
    expect(validateExtensionId('a::b::c::d').valid).toBe(false)
  })

  it('should accept simple ids (no ::)', () => {
    expect(validateExtensionId('my-extension').valid).toBe(true)
  })
})

describe('validateStrategy', () => {
  it('should return invalid for empty strategy', () => {
    expect(validateStrategy('').valid).toBe(false)
    expect(validateStrategy(null).valid).toBe(false)
    expect(validateStrategy(undefined).valid).toBe(false)
  })

  it('should validate all valid strategies', () => {
    expect(validateStrategy('throw').valid).toBe(true)
    expect(validateStrategy('last_wins').valid).toBe(true)
    expect(validateStrategy('first_wins').valid).toBe(true)
    expect(validateStrategy('merge').valid).toBe(true)
    expect(validateStrategy('stack').valid).toBe(true)
  })

  it('should reject invalid strategies', () => {
    expect(validateStrategy('invalid').valid).toBe(false)
    expect(validateStrategy('THROW').valid).toBe(false)
  })
})

describe('validateJsonString', () => {
  it('should return valid for empty string', () => {
    expect(validateJsonString('').valid).toBe(true)
    expect(validateJsonString('   ').valid).toBe(true)
  })

  it('should validate valid JSON object strings', () => {
    expect(validateJsonString('{"key": "value"}').valid).toBe(true)
    expect(validateJsonString('{"a": 1, "b": true}').valid).toBe(true)
  })

  it('should reject invalid JSON', () => {
    expect(validateJsonString('{invalid}').valid).toBe(false)
    expect(validateJsonString('not json').valid).toBe(false)
  })

  it('should reject arrays and primitives', () => {
    expect(validateJsonString('[1, 2, 3]').valid).toBe(false)
    expect(validateJsonString('"string"').valid).toBe(false)
    expect(validateJsonString('123').valid).toBe(false)
  })
})

describe('validateOverrideTargets', () => {
  it('should return invalid for empty targets', () => {
    expect(validateOverrideTargets('').valid).toBe(false)
    expect(validateOverrideTargets('   ').valid).toBe(false)
  })

  it('should return invalid for no valid targets after split', () => {
    expect(validateOverrideTargets(',,,').valid).toBe(false)
  })

  it('should validate targets when no existing extensions', () => {
    const result = validateOverrideTargets('ext1, ext2', [])
    expect(result.valid).toBe(true)
  })

  it('should validate existing targets', () => {
    const existing = [
      { id: 'ext1', ext_id: 'ext1' },
      { id: 'ext2', ext_id: 'ext2' },
    ]
    const result = validateOverrideTargets('ext1, ext2', existing)
    expect(result.valid).toBe(true)
  })

  it('should reject non-existing targets when extensions exist', () => {
    const existing = [{ id: 'ext1', ext_id: 'ext1' }]
    const result = validateOverrideTargets('ext2', existing)
    expect(result.valid).toBe(false)
    expect(result.firstError.message).toContain('ext2')
  })
})

describe('validatePriority', () => {
  it('should return valid for empty/null/undefined', () => {
    expect(validatePriority(null).valid).toBe(true)
    expect(validatePriority(undefined).valid).toBe(true)
    expect(validatePriority('').valid).toBe(true)
  })

  it('should validate integer priorities', () => {
    expect(validatePriority(0).valid).toBe(true)
    expect(validatePriority(10).valid).toBe(true)
    expect(validatePriority(-5).valid).toBe(true)
    expect(validatePriority('100').valid).toBe(true)
  })

  it('should reject non-numeric values', () => {
    expect(validatePriority('abc').valid).toBe(false)
  })

  it('should reject non-integer values', () => {
    expect(validatePriority(1.5).valid).toBe(false)
    expect(validatePriority('2.5').valid).toBe(false)
  })
})

describe('validateOrder', () => {
  it('should return valid for empty/null/undefined', () => {
    expect(validateOrder(null).valid).toBe(true)
    expect(validateOrder(undefined).valid).toBe(true)
    expect(validateOrder('').valid).toBe(true)
  })

  it('should validate integer orders', () => {
    expect(validateOrder(0).valid).toBe(true)
    expect(validateOrder(100).valid).toBe(true)
    expect(validateOrder('50').valid).toBe(true)
  })

  it('should reject non-numeric values', () => {
    expect(validateOrder('abc').valid).toBe(false)
  })

  it('should reject non-integer values', () => {
    expect(validateOrder(1.5).valid).toBe(false)
  })
})

describe('validatePointDefinition', () => {
  it('should validate complete point definition', () => {
    const result = validatePointDefinition({
      name: 'crm.customer.detail',
      strategy: 'last_wins',
    })
    expect(result.valid).toBe(true)
  })

  it('should fail with invalid name', () => {
    const result = validatePointDefinition({
      name: '',
      strategy: 'last_wins',
    })
    expect(result.valid).toBe(false)
  })

  it('should fail with invalid strategy', () => {
    const result = validatePointDefinition({
      name: 'crm.customer.detail',
      strategy: 'invalid',
    })
    expect(result.valid).toBe(false)
  })
})

describe('validatePackageRegistration', () => {
  it('should validate complete package registration', () => {
    const result = validatePackageRegistration({
      id: 'crm-advanced',
      name: 'CRM 高级功能',
      version: '1.0.0',
    })
    expect(result.valid).toBe(true)
  })

  it('should fail with invalid id', () => {
    const result = validatePackageRegistration({
      id: '',
      name: 'Test',
    })
    expect(result.valid).toBe(false)
  })

  it('should fail with invalid name', () => {
    const result = validatePackageRegistration({
      id: 'test-pkg',
      name: '',
    })
    expect(result.valid).toBe(false)
  })

  it('should fail with invalid version', () => {
    const result = validatePackageRegistration({
      id: 'test-pkg',
      name: 'Test',
      version: 'invalid',
    })
    expect(result.valid).toBe(false)
  })

  it('should accept package_id as alias for id', () => {
    const result = validatePackageRegistration({
      package_id: 'test-pkg',
      name: 'Test',
    })
    expect(result.valid).toBe(true)
  })
})

describe('validateExtensionRegistration', () => {
  it('should validate basic extension registration', () => {
    const result = validateExtensionRegistration('pkg1', {
      point: 'crm.customer.detail',
    })
    expect(result.valid).toBe(true)
  })

  it('should fail without packageId', () => {
    const result = validateExtensionRegistration('', {
      point: 'crm.customer.detail',
    })
    expect(result.valid).toBe(false)
    expect(result.getFieldError('packageId')).toBeTruthy()
  })

  it('should fail without point', () => {
    const result = validateExtensionRegistration('pkg1', {})
    expect(result.valid).toBe(false)
    expect(result.getFieldError('point')).toBeTruthy()
  })

  it('should fail when override is true but no targets', () => {
    const result = validateExtensionRegistration('pkg1', {
      point: 'crm.customer.detail',
      override: true,
      overrideTargets: [],
    })
    expect(result.valid).toBe(false)
    expect(result.getFieldError('overrideTargets')).toBeTruthy()
  })

  it('should validate with override targets that exist', () => {
    const existing = [{ id: 'ext1', ext_id: 'ext1' }]
    const result = validateExtensionRegistration(
      'pkg1',
      {
        point: 'crm.customer.detail',
        override: true,
        overrideTargets: ['ext1'],
      },
      existing
    )
    expect(result.valid).toBe(true)
  })

  it('should fail with non-existing override targets', () => {
    const existing = [{ id: 'ext1', ext_id: 'ext1' }]
    const result = validateExtensionRegistration(
      'pkg1',
      {
        point: 'crm.customer.detail',
        override: true,
        overrideTargets: ['ext2'],
      },
      existing
    )
    expect(result.valid).toBe(false)
  })

  it('should validate extension id', () => {
    const result = validateExtensionRegistration('pkg1', {
      point: 'crm.customer.detail',
      id: 123,
    })
    expect(result.valid).toBe(false)
    expect(result.getFieldError('id')).toBeTruthy()
  })
})

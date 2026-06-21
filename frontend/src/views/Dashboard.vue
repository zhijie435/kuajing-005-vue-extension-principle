<template>
  <div class="dashboard">
    <ToastContainer />

    <div class="stats-grid">
      <div class="stat-card" v-for="stat in statCards" :key="stat.label">
        <div class="stat-icon" :style="{ background: stat.color }">{{ stat.icon }}</div>
        <div class="stat-info">
          <div class="stat-value">{{ stat.value }}</div>
          <div class="stat-label">{{ stat.label }}</div>
        </div>
      </div>
    </div>

    <div class="section-grid">
      <section class="section">
        <div class="section-header">
          <h2>扩展点</h2>
          <button class="btn btn-primary" @click="openDefinePoint">+ 定义扩展点</button>
        </div>
        <div class="table-wrap">
          <table class="data-table" v-if="store.points.length">
            <thead>
              <tr>
                <th>名称</th>
                <th>策略</th>
                <th>多扩展</th>
                <th>必填</th>
                <th>扩展数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in store.points" :key="p.name">
                <td><code>{{ p.name }}</code></td>
                <td><span class="badge" :class="'strategy-' + p.strategy">{{ p.strategy }}</span></td>
                <td>{{ p.multiple ? '✓' : '✗' }}</td>
                <td>{{ p.required ? '✓' : '✗' }}</td>
                <td>{{ getExtensionCount(p.name) }}</td>
                <td><button class="btn btn-danger btn-sm" @click="handleDeletePoint(p.name)">删除</button></td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-else>暂无扩展点，点击上方按钮定义</div>
        </div>
      </section>

      <section class="section">
        <div class="section-header">
          <h2>扩展包</h2>
          <button class="btn btn-primary" @click="openRegisterPackage">+ 注册扩展包</button>
        </div>
        <div class="table-wrap">
          <table class="data-table" v-if="store.packages.length">
            <thead>
              <tr>
                <th>ID</th>
                <th>名称</th>
                <th>版本</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="pkg in store.packages" :key="pkg.package_id">
                <td><code>{{ pkg.package_id }}</code></td>
                <td>{{ pkg.name }}</td>
                <td>{{ pkg.version }}</td>
                <td><span class="badge" :class="pkg.enabled ? 'badge-success' : 'badge-muted'">{{ pkg.enabled ? '启用' : '禁用' }}</span></td>
                <td>
                  <button class="btn btn-warning btn-sm" @click="handleCheckOverride(pkg.package_id)">覆盖检查</button>
                  <button class="btn btn-danger btn-sm" @click="handleDeletePackage(pkg.package_id)">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="empty" v-else>暂无扩展包</div>
        </div>
      </section>
    </div>

    <section class="section">
      <div class="section-header">
        <h2>已注册扩展</h2>
        <select v-model="filterPoint" class="input filter-select">
          <option value="">全部扩展点</option>
          <option v-for="p in store.points" :key="p.name" :value="p.name">{{ p.name }}</option>
        </select>
      </div>
      <div class="table-wrap">
        <table class="data-table" v-if="filteredExtensions.length">
          <thead>
            <tr>
              <th>扩展ID</th>
              <th>扩展点</th>
              <th>扩展包</th>
              <th>优先级</th>
              <th>排序</th>
              <th>状态</th>
              <th>覆盖</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="ext in filteredExtensions" :key="ext.ext_id">
              <td><code>{{ ext.ext_id }}</code></td>
              <td><code>{{ ext.point_name }}</code></td>
              <td>{{ ext.package_id }}</td>
              <td>{{ ext.priority }}</td>
              <td>{{ ext.order }}</td>
              <td><span class="badge" :class="'state-' + ext.state">{{ ext.state }}</span></td>
              <td>{{ ext.is_override ? '✓ → ' + (ext.override_targets || []).join(', ') : '✗' }}</td>
              <td><button class="btn btn-danger btn-sm" @click="handleUnregister(ext.ext_id)">注销</button></td>
            </tr>
          </tbody>
        </table>
        <div class="empty" v-else>暂无已注册扩展</div>
      </div>
    </section>

    <section class="section">
      <div class="section-header">
        <h2>覆盖冲突</h2>
        <span class="badge badge-error" v-if="store.unresolvedConflicts.length">{{ store.unresolvedConflicts.length }} 未解决</span>
      </div>
      <div class="table-wrap">
        <table class="data-table" v-if="store.conflicts.length">
          <thead>
            <tr>
              <th>扩展点</th>
              <th>类型</th>
              <th>现有扩展</th>
              <th>新扩展</th>
              <th>策略</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="c in store.conflicts" :key="c.id" :class="{ 'row-warning': !c.resolved }">
              <td><code>{{ c.point_name }}</code></td>
              <td>{{ c.type }}</td>
              <td><code>{{ c.existing_ext_id }}</code> ({{ c.existing_package_id }})</td>
              <td><code>{{ c.incoming_ext_id }}</code> ({{ c.incoming_package_id }})</td>
              <td><span class="badge" :class="'strategy-' + c.strategy">{{ c.strategy }}</span></td>
              <td><span class="badge" :class="c.resolved ? 'badge-success' : 'badge-error'">{{ c.resolved ? '已解决: ' + c.resolution : '未解决' }}</span></td>
              <td>
                <template v-if="!c.resolved">
                  <button class="btn btn-success btn-sm" @click="handleResolveConflict(c.id, 'incoming_wins')">新扩展胜</button>
                  <button class="btn btn-warning btn-sm" @click="handleResolveConflict(c.id, 'existing_wins')">原扩展胜</button>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="empty" v-else>暂无覆盖冲突 🎉</div>
      </div>
    </section>

    <Teleport to="body">
      <div class="modal-overlay" v-if="showDefinePoint" @click.self="showDefinePoint = false">
        <div class="modal">
          <h3>定义扩展点</h3>
          <form @submit.prevent="handleDefinePoint" novalidate>
            <div class="form-group">
              <label>名称 <span class="required">*</span></label>
              <input class="input" :class="{ 'input-error': formErrors.name }" v-model="pointForm.name" placeholder="crm.customer.detail.action" />
              <div class="field-hint" v-if="!formErrors.name">点分隔标识符格式，如 crm.customer.detail.action</div>
              <div class="field-error" v-if="formErrors.name">{{ formErrors.name }}</div>
            </div>
            <div class="form-group">
              <label>描述</label>
              <input class="input" v-model="pointForm.description" placeholder="客户详情页操作区" />
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>覆盖策略</label>
                <select class="input" :class="{ 'input-error': formErrors.strategy }" v-model="pointForm.strategy">
                  <option value="last_wins">last_wins (后注册优先)</option>
                  <option value="first_wins">first_wins (先注册优先)</option>
                  <option value="throw">throw (抛出异常)</option>
                  <option value="merge">merge (合并属性)</option>
                  <option value="stack">stack (堆叠共存)</option>
                </select>
                <div class="field-error" v-if="formErrors.strategy">{{ formErrors.strategy }}</div>
              </div>
              <div class="form-group">
                <label>允许多扩展</label>
                <label class="switch"><input type="checkbox" v-model="pointForm.multiple" /><span class="switch-slider"></span></label>
              </div>
              <div class="form-group">
                <label>必填</label>
                <label class="switch"><input type="checkbox" v-model="pointForm.required" /><span class="switch-slider"></span></label>
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn" @click="showDefinePoint = false">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="submitting">
                <span v-if="submitting" class="spinner"></span>
                {{ submitting ? '提交中...' : '确定' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="modal-overlay" v-if="showRegisterPackage" @click.self="showRegisterPackage = false">
        <div class="modal">
          <h3>注册扩展包</h3>
          <form @submit.prevent="handleRegisterPackage" novalidate>
            <div class="form-group">
              <label>包ID <span class="required">*</span></label>
              <input class="input" :class="{ 'input-error': formErrors.packageId }" v-model="packageForm.id" placeholder="crm-advanced-features" />
              <div class="field-hint" v-if="!formErrors.packageId">字母开头的标识符，可用连字符和点</div>
              <div class="field-error" v-if="formErrors.packageId">{{ formErrors.packageId }}</div>
            </div>
            <div class="form-group">
              <label>名称 <span class="required">*</span></label>
              <input class="input" :class="{ 'input-error': formErrors.packageName }" v-model="packageForm.name" placeholder="CRM高级功能包" />
              <div class="field-error" v-if="formErrors.packageName">{{ formErrors.packageName }}</div>
            </div>
            <div class="form-group">
              <label>版本</label>
              <input class="input" :class="{ 'input-error': formErrors.version }" v-model="packageForm.version" placeholder="1.0.0" />
              <div class="field-error" v-if="formErrors.version">{{ formErrors.version }}</div>
            </div>
            <div class="form-group">
              <label>描述</label>
              <input class="input" v-model="packageForm.description" placeholder="CRM高级功能扩展" />
            </div>
            <div class="form-actions">
              <button type="button" class="btn" @click="showRegisterPackage = false">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="submitting">
                <span v-if="submitting" class="spinner"></span>
                {{ submitting ? '提交中...' : '注册' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="modal-overlay" v-if="showRegisterExt" @click.self="showRegisterExt = false">
        <div class="modal modal-lg">
          <h3>注册扩展</h3>
          <form @submit.prevent="handleRegisterExtension" novalidate>
            <div class="form-row">
              <div class="form-group">
                <label>扩展包ID <span class="required">*</span></label>
                <select class="input" :class="{ 'input-error': formErrors.packageId }" v-model="extForm.packageId">
                  <option value="">选择扩展包</option>
                  <option v-for="pkg in store.packages" :key="pkg.package_id" :value="pkg.package_id">{{ pkg.package_id }} - {{ pkg.name }}</option>
                </select>
                <div class="field-error" v-if="formErrors.packageId">{{ formErrors.packageId }}</div>
              </div>
              <div class="form-group">
                <label>扩展点 <span class="required">*</span></label>
                <select class="input" :class="{ 'input-error': formErrors.point }" v-model="extForm.point">
                  <option value="">选择扩展点</option>
                  <option v-for="p in store.points" :key="p.name" :value="p.name">{{ p.name }}</option>
                </select>
                <div class="field-error" v-if="formErrors.point">{{ formErrors.point }}</div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>扩展ID（可选）</label>
                <input class="input" :class="{ 'input-error': formErrors.extId }" v-model="extForm.id" placeholder="自动生成" />
                <div class="field-error" v-if="formErrors.extId">{{ formErrors.extId }}</div>
              </div>
              <div class="form-group">
                <label>组件名</label>
                <input class="input" v-model="extForm.component" placeholder="CustomerActionPanel" />
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label>优先级</label>
                <input class="input" :class="{ 'input-error': formErrors.priority }" type="number" v-model.number="extForm.priority" />
                <div class="field-error" v-if="formErrors.priority">{{ formErrors.priority }}</div>
              </div>
              <div class="form-group">
                <label>排序</label>
                <input class="input" :class="{ 'input-error': formErrors.order }" type="number" v-model.number="extForm.order" />
                <div class="field-error" v-if="formErrors.order">{{ formErrors.order }}</div>
              </div>
            </div>
            <div class="form-group">
              <label class="checkbox-label">
                <input type="checkbox" v-model="extForm.override" />
                标记为覆盖扩展
              </label>
            </div>
            <div class="form-group" v-if="extForm.override">
              <label>覆盖目标（逗号分隔扩展ID）<span class="required">*</span></label>
              <input class="input" :class="{ 'input-error': formErrors.overrideTargets }" v-model="extForm.overrideTargetsStr" placeholder="ext-id-1, ext-id-2" />
              <div class="field-hint" v-if="!formErrors.overrideTargets && currentPointExtensions.length">当前扩展点已有扩展: {{ currentPointExtensions.map(e => e.ext_id).join(', ') }}</div>
              <div class="field-error" v-if="formErrors.overrideTargets">{{ formErrors.overrideTargets }}</div>
            </div>
            <div class="form-group">
              <label>Props (JSON)</label>
              <textarea class="input textarea" :class="{ 'input-error': formErrors.props }" v-model="extForm.propsStr" placeholder='{"title": "自定义标题"}' rows="3"></textarea>
              <div class="field-error" v-if="formErrors.props">{{ formErrors.props }}</div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn" @click="showRegisterExt = false">取消</button>
              <button type="submit" class="btn btn-primary" :disabled="submitting">
                <span v-if="submitting" class="spinner"></span>
                {{ submitting ? '提交中...' : '注册' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div class="modal-overlay" v-if="showImpactResult" @click.self="showImpactResult = false">
        <div class="modal">
          <h3>覆盖影响分析</h3>
          <div class="impact-result">
            <div class="impact-status" :class="impactResult.can_install ? 'status-ok' : 'status-error'">
              {{ impactResult.can_install ? '✓ 可以安装' : '✗ 存在阻断冲突' }}
            </div>
            <div v-if="impactResult.conflicts?.length">
              <h4>冲突 ({{ impactResult.conflicts.length }})</h4>
              <div class="impact-item" v-for="(c, i) in impactResult.conflicts" :key="i">
                <span class="badge badge-error">{{ c.type }}</span>
                <code>{{ c.existing_ext_id }}</code> ← <code>{{ c.incoming_ext_id }}</code>
                <span class="badge" :class="'strategy-' + c.resolution">{{ c.resolution }}</span>
              </div>
            </div>
            <div v-if="impactResult.warnings?.length">
              <h4>警告 ({{ impactResult.warnings.length }})</h4>
              <div class="impact-item" v-for="(w, i) in impactResult.warnings" :key="i">
                <span class="badge badge-warning">{{ w.type }}</span>
                {{ w.message }}
              </div>
            </div>
          </div>
          <div class="form-actions">
            <button class="btn" @click="showImpactResult = false">关闭</button>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="fab-bar">
      <button class="fab" @click="openRegisterExt" title="注册扩展">+</button>
      <button class="fab fab-secondary" @click="handleRefresh" title="刷新" :disabled="store.loading">↻</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive, watch } from 'vue'
import { useExtensionStore } from '../store/extension'
import { toast } from '../components/toast'
import ToastContainer from '../components/ToastContainer.vue'
import {
  validatePointDefinition,
  validatePackageRegistration,
  validateExtensionRegistration,
  validateJsonString,
  validateOverrideTargets,
  ValidationResult,
} from '../plugin/validator'

const store = useExtensionStore()

const showDefinePoint = ref(false)
const showRegisterPackage = ref(false)
const showRegisterExt = ref(false)
const showImpactResult = ref(false)
const impactResult = ref({})
const filterPoint = ref('')
const submitting = ref(false)
const formErrors = reactive({})

function clearErrors() {
  Object.keys(formErrors).forEach(k => delete formErrors[k])
}

function setErrors(validationResult) {
  clearErrors()
  if (!validationResult.valid) {
    const fieldMap = validationResult.fieldErrors
    for (const [field, messages] of Object.entries(fieldMap)) {
      formErrors[field] = messages[0]
    }
  }
}

function setErrorsFromMap(errorMap) {
  clearErrors()
  for (const [field, msg] of Object.entries(errorMap)) {
    formErrors[field] = msg
  }
}

const pointForm = reactive({
  name: '',
  description: '',
  strategy: 'last_wins',
  multiple: true,
  required: false,
})

const packageForm = reactive({
  id: '',
  name: '',
  version: '1.0.0',
  description: '',
})

const extForm = reactive({
  packageId: '',
  point: '',
  id: '',
  component: '',
  priority: 0,
  order: 100,
  override: false,
  overrideTargetsStr: '',
  propsStr: '',
})

const statCards = computed(() => [
  { icon: '📍', label: '扩展点', value: store.stats.points, color: '#6366f1' },
  { icon: '📦', label: '扩展包', value: store.stats.packages, color: '#8b5cf6' },
  { icon: '🔌', label: '扩展数', value: store.stats.extensions, color: '#06b6d4' },
  { icon: '✅', label: '活跃扩展', value: store.stats.active, color: '#10b981' },
  { icon: '⚡', label: '冲突数', value: store.stats.conflicts, color: '#f59e0b' },
  { icon: '🔴', label: '未解决', value: store.stats.unresolved, color: '#ef4444' },
])

const filteredExtensions = computed(() => {
  if (!filterPoint.value) return store.extensions
  return store.extensions.filter(e => e.point_name === filterPoint.value)
})

const currentPointExtensions = computed(() => {
  if (!extForm.point) return []
  return store.extensions.filter(e => e.point_name === extForm.point)
})

function getExtensionCount(pointName) {
  return store.extensions.filter(e => e.point_name === pointName).length
}

function openDefinePoint() {
  clearErrors()
  Object.assign(pointForm, { name: '', description: '', strategy: 'last_wins', multiple: true, required: false })
  showDefinePoint.value = true
}

function openRegisterPackage() {
  clearErrors()
  Object.assign(packageForm, { id: '', name: '', version: '1.0.0', description: '' })
  showRegisterPackage.value = true
}

function openRegisterExt() {
  clearErrors()
  Object.assign(extForm, { packageId: '', point: '', id: '', component: '', priority: 0, order: 100, override: false, overrideTargetsStr: '', propsStr: '' })
  showRegisterExt.value = true
}

async function handleDefinePoint() {
  clearErrors()
  const validation = validatePointDefinition({
    name: pointForm.name,
    strategy: pointForm.strategy,
  })
  if (!validation.valid) {
    setErrors(validation)
    toast.warning('请修正表单中的校验错误')
    return
  }

  submitting.value = true
  try {
    await store.definePoint({ ...pointForm })
    showDefinePoint.value = false
    toast.success(`扩展点 "${pointForm.name}" 定义成功`)
    Object.assign(pointForm, { name: '', description: '', strategy: 'last_wins', multiple: true, required: false })
  } catch (e) {
    const fieldMap = {}
    if (e.message?.includes('already exists') || e.message?.includes('UNIQUE constraint')) {
      fieldMap.name = '该扩展点名称已存在'
    } else {
      fieldMap.name = e.message || '定义失败'
    }
    setErrorsFromMap(fieldMap)
    toast.error(`定义失败: ${e.message}`)
  } finally {
    submitting.value = false
  }
}

async function handleDeletePoint(name) {
  if (confirm(`确定删除扩展点 "${name}"？其下所有扩展和冲突也将被删除。`)) {
    try {
      await store.deletePoint(name)
      toast.success(`扩展点 "${name}" 已删除`)
    } catch (e) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

async function handleRegisterPackage() {
  clearErrors()
  const validation = validatePackageRegistration({
    id: packageForm.id,
    name: packageForm.name,
    version: packageForm.version,
  })
  if (!validation.valid) {
    setErrors(validation)
    toast.warning('请修正表单中的校验错误')
    return
  }

  submitting.value = true
  try {
    await store.registerPackage({ ...packageForm })
    showRegisterPackage.value = false
    toast.success(`扩展包 "${packageForm.id}" 注册成功`)
    Object.assign(packageForm, { id: '', name: '', version: '1.0.0', description: '' })
  } catch (e) {
    const fieldMap = {}
    if (e.message?.includes('already exists') || e.message?.includes('UNIQUE constraint')) {
      fieldMap.packageId = '该扩展包ID已存在'
    } else {
      fieldMap.packageId = e.message || '注册失败'
    }
    setErrorsFromMap(fieldMap)
    toast.error(`注册失败: ${e.message}`)
  } finally {
    submitting.value = false
  }
}

async function handleDeletePackage(id) {
  if (confirm(`确定删除扩展包 "${id}"？其下所有扩展也将被删除。`)) {
    try {
      await store.deletePackage(id)
      toast.success(`扩展包 "${id}" 已删除`)
    } catch (e) {
      toast.error(`删除失败: ${e.message}`)
    }
  }
}

async function handleRegisterExtension() {
  clearErrors()

  const errorMap = {}

  if (!extForm.packageId) {
    errorMap.packageId = '请选择扩展包'
  }
  if (!extForm.point) {
    errorMap.point = '请选择扩展点'
  }

  if (extForm.propsStr && extForm.propsStr.trim()) {
    const propsValidation = validateJsonString(extForm.propsStr, 'props')
    if (!propsValidation.valid) {
      errorMap.props = propsValidation.firstError.message
    }
  }

  if (extForm.override) {
    const targetsValidation = validateOverrideTargets(extForm.overrideTargetsStr, store.extensions)
    if (!targetsValidation.valid) {
      errorMap.overrideTargets = targetsValidation.firstError.message
    }
  }

  if (Object.keys(errorMap).length > 0) {
    setErrorsFromMap(errorMap)
    toast.warning('请修正表单中的校验错误')
    return
  }

  submitting.value = true
  try {
    const data = {
      point: extForm.point,
      id: extForm.id || undefined,
      component: extForm.component || undefined,
      priority: extForm.priority,
      order: extForm.order,
      override: extForm.override,
      overrideTargets: extForm.overrideTargetsStr ? extForm.overrideTargetsStr.split(',').map(s => s.trim()).filter(Boolean) : [],
      props: extForm.propsStr ? JSON.parse(extForm.propsStr) : undefined,
    }

    const result = await store.registerExtension(extForm.packageId, data)

    if (result?.conflicts?.length) {
      toast.warning(`注册成功，但产生了 ${result.conflicts.length} 个覆盖冲突，请查看冲突列表`)
    } else {
      toast.success('扩展注册成功')
    }

    showRegisterExt.value = false
    Object.assign(extForm, { packageId: '', point: '', id: '', component: '', priority: 0, order: 100, override: false, overrideTargetsStr: '', propsStr: '' })
  } catch (e) {
    const fieldMap = {}
    const msg = e.message || '注册失败'
    if (msg.includes('not found') || msg.includes('is not defined')) {
      fieldMap.point = msg
    } else if (msg.includes('already registered') || msg.includes('UNIQUE constraint')) {
      fieldMap.extId = '该扩展ID已被注册'
    } else if (msg.includes('Override conflict')) {
      fieldMap.overrideTargets = msg
    } else if (msg.includes('覆盖目标不存在')) {
      fieldMap.overrideTargets = msg
    } else if (msg.includes('validation') || msg.includes('failed validation')) {
      fieldMap.extId = msg
    } else {
      fieldMap.extId = msg
    }
    setErrorsFromMap(fieldMap)
    toast.error(`注册失败: ${msg}`)
  } finally {
    submitting.value = false
  }
}

async function handleUnregister(extId) {
  if (confirm(`确定注销扩展 "${extId}"？`)) {
    try {
      await store.unregisterExtension(extId)
      toast.success(`扩展 "${extId}" 已注销`)
    } catch (e) {
      toast.error(`注销失败: ${e.message}`)
    }
  }
}

async function handleCheckOverride(packageId) {
  try {
    impactResult.value = await store.checkOverrideImpact(packageId)
    showImpactResult.value = true
  } catch (e) {
    toast.error(`检查失败: ${e.message}`)
  }
}

async function handleResolveConflict(id, resolution) {
  try {
    await store.resolveConflict(id, resolution)
    toast.success('冲突已解决')
  } catch (e) {
    toast.error(`解决失败: ${e.message}`)
  }
}

async function handleRefresh() {
  try {
    await store.init()
    toast.info('数据已刷新')
  } catch (e) {
    toast.error(`刷新失败: ${e.message}`)
  }
}

onMounted(() => {
  store.init()
})
</script>

<style scoped>
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: #1e293b;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
  margin-bottom: 32px;
}

.stat-card {
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
  border: 1px solid #e2e8f0;
}

.stat-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  color: #fff;
  flex-shrink: 0;
}

.stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: 13px;
  color: #64748b;
  margin-top: 4px;
}

.section-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 24px;
}

.section {
  background: #fff;
  border-radius: 12px;
  padding: 24px;
  box-shadow: 0 1px 3px rgba(0,0,0,.08);
  border: 1px solid #e2e8f0;
  margin-bottom: 24px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 12px;
}

.section-header h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.table-wrap {
  overflow-x: auto;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.data-table th {
  text-align: left;
  padding: 10px 12px;
  background: #f8fafc;
  border-bottom: 2px solid #e2e8f0;
  font-weight: 600;
  color: #475569;
  white-space: nowrap;
}

.data-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: middle;
}

.data-table tr.row-warning {
  background: #fffbeb;
}

code {
  background: #f1f5f9;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
  color: #6366f1;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 9999px;
  font-size: 11px;
  font-weight: 600;
  background: #f1f5f9;
  color: #475569;
}

.badge-success { background: #dcfce7; color: #16a34a; }
.badge-error { background: #fef2f2; color: #dc2626; }
.badge-warning { background: #fef9c3; color: #a16207; }
.badge-muted { background: #f1f5f9; color: #94a3b8; }

.strategy-last_wins { background: #dbeafe; color: #2563eb; }
.strategy-first_wins { background: #ede9fe; color: #7c3aed; }
.strategy-throw { background: #fef2f2; color: #dc2626; }
.strategy-merge { background: #dcfce7; color: #16a34a; }
.strategy-stack { background: #fef9c3; color: #a16207; }

.state-active { background: #dcfce7; color: #16a34a; }
.state-registered { background: #dbeafe; color: #2563eb; }
.state-disabled { background: #f1f5f9; color: #94a3b8; }
.state-override_conflict { background: #fef2f2; color: #dc2626; }

.btn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  background: #fff;
  cursor: pointer;
  font-size: 13px;
  transition: all .15s;
}

.btn:hover { background: #f8fafc; }
.btn-primary { background: #6366f1; color: #fff; border-color: #6366f1; }
.btn-primary:hover { background: #4f46e5; }
.btn-primary:disabled { background: #a5b4fc; border-color: #a5b4fc; cursor: not-allowed; }
.btn-danger { background: #ef4444; color: #fff; border-color: #ef4444; }
.btn-danger:hover { background: #dc2626; }
.btn-warning { background: #f59e0b; color: #fff; border-color: #f59e0b; }
.btn-warning:hover { background: #d97706; }
.btn-success { background: #10b981; color: #fff; border-color: #10b981; }
.btn-success:hover { background: #059669; }
.btn-sm { padding: 3px 8px; font-size: 12px; }

.input {
  padding: 8px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  font-size: 14px;
  width: 100%;
  box-sizing: border-box;
  transition: border-color .15s;
}

.input:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.1); }

.input-error {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239,68,68,.1);
}

.input-error:focus {
  border-color: #ef4444;
  box-shadow: 0 0 0 3px rgba(239,68,68,.15);
}

.textarea { resize: vertical; font-family: monospace; }

.filter-select { width: auto; min-width: 200px; }

.required {
  color: #ef4444;
  font-weight: 600;
}

.field-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 4px;
}

.field-error {
  font-size: 12px;
  color: #ef4444;
  margin-top: 4px;
  font-weight: 500;
}

.spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .6s linear infinite;
  vertical-align: middle;
  margin-right: 4px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;
}

.switch input { opacity: 0; width: 0; height: 0; }

.switch-slider {
  position: absolute;
  inset: 0;
  background: #cbd5e1;
  border-radius: 24px;
  transition: .3s;
  cursor: pointer;
}

.switch-slider::before {
  content: '';
  position: absolute;
  width: 18px;
  height: 18px;
  left: 3px;
  bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: .3s;
}

.switch input:checked + .switch-slider { background: #6366f1; }
.switch input:checked + .switch-slider::before { transform: translateX(20px); }

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.modal {
  background: #fff;
  border-radius: 16px;
  padding: 32px;
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}

.modal-lg { max-width: 680px; }

.modal h3 {
  margin: 0 0 24px;
  font-size: 20px;
  font-weight: 700;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: #475569;
  margin-bottom: 6px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  cursor: pointer;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.impact-result {
  margin: 16px 0;
}

.impact-status {
  font-size: 18px;
  font-weight: 700;
  padding: 12px 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.status-ok { background: #dcfce7; color: #16a34a; }
.status-error { background: #fef2f2; color: #dc2626; }

.impact-item {
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.fab-bar {
  position: fixed;
  bottom: 32px;
  right: 32px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fab {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: #6366f1;
  color: #fff;
  border: none;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(99,102,241,.4);
  transition: transform .15s, box-shadow .15s;
}

.fab:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(99,102,241,.5); }
.fab-secondary { background: #8b5cf6; width: 44px; height: 44px; font-size: 18px; border-radius: 12px; }

.empty {
  text-align: center;
  padding: 32px;
  color: #94a3b8;
  font-size: 14px;
}

@media (max-width: 768px) {
  .section-grid { grid-template-columns: 1fr; }
  .form-row { grid-template-columns: 1fr; }
}
</style>

# Vue 扩展原则部署文档

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 扩展包注册流程](#2-扩展包注册流程)
- [3. 覆盖检查机制](#3-覆盖检查机制)
- [4. 环境变量配置](#4-环境变量配置)
- [5. 验收命令](#5-验收命令)
- [6. 快速开始](#6-快速开始)
- [7. 常见问题](#7-常见问题)

---

## 1. 项目概述

本项目是一个基于 Vue 3 + PHP 的 CRM 客户跟进系统，核心特性是**可扩展的扩展点管理系统**。系统允许开发者通过注册扩展包（Package）的方式，在预定义的扩展点（Extension Point）上插入自定义功能（Extension），实现业务逻辑的灵活扩展。

### 核心概念

| 概念 | 说明 |
|------|------|
| **扩展点 (Extension Point)** | 系统预先定义的功能插入位置，如 `crm.customer.detail.action` |
| **扩展包 (Package)** | 一组扩展的集合，包含唯一ID、名称、版本和多个扩展定义 |
| **扩展 (Extension)** | 具体的功能实现，挂载到某个扩展点上 |
| **覆盖策略 (Override Strategy)** | 当多个扩展冲突时的解决规则 |

---

## 2. 扩展包注册流程

### 2.1 扩展包结构

一个标准的扩展包定义如下：

```javascript
const myPackage = {
  id: 'crm-advanced-features',           // 扩展包唯一ID (必填)
  name: 'CRM高级功能包',                   // 扩展包名称 (必填)
  version: '1.2.0',                       // 版本号 (semver格式)
  description: '提供CRM系统的高级功能',     // 描述信息
  enabled: true,                          // 是否启用
  dependencies: [],                       // 依赖的其他扩展包
  extensions: [                           // 扩展定义列表
    {
      id: 'crm-advanced-features::customer-list::toolbar',  // 扩展ID (可选)
      point: 'crm.customer.list.toolbar',                    // 挂载的扩展点 (必填)
      component: CustomerToolbarButton,                      // Vue组件
      props: { color: 'primary' },                           // 组件属性
      order: 10,                                             // 排序 (默认100)
      priority: 1,                                           // 优先级 (默认0)
      override: false,                                       // 是否覆盖其他扩展
      overrideTargets: [],                                   // 要覆盖的目标扩展ID列表
      metadata: { author: 'team-a' }                         // 元数据
    }
  ]
}
```

### 2.2 扩展包注册流程（前端）

#### 2.2.1 前端核心API

前端扩展管理器位于 [frontend/src/plugin/](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/) 目录。

**主要入口：** [index.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/index.js#L17-L47)

```javascript
import { createExtensionPlugin } from './plugin'

// 1. 创建扩展管理器
const { plugin: extPlugin, manager } = createExtensionPlugin({
  defaultStrategy: 'last_wins',    // 默认覆盖策略
  logLevel: 1,                     // 日志级别: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
  strictOverride: false,           // 是否严格覆盖模式
  enablePermissionCheck: false,    // 是否启用权限检查
})

// 2. 注册到Vue应用
app.use(extPlugin)
```

#### 2.2.2 扩展包注册方法

| 方法 | 说明 | 位置 |
|------|------|------|
| `manager.registerPackage(pkg, options)` | 注册扩展包 | [ExtensionPointManager.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/ExtensionPointManager.js#L338-L483) |
| `manager.validateAndRegisterPackage(pkg)` | 先验证再注册 | [ExtensionPointManager.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/ExtensionPointManager.js#L998-L1042) |
| `manager.validatePackageRegistration(pkg)` | 仅验证不注册 | [ExtensionPointManager.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/ExtensionPointManager.js#L108-L175) |

**注册示例：**

```javascript
// 方式一：直接注册
const result = manager.registerPackage(myPackage, {
  skipRollback: false,           // 是否跳过回滚记录
  failOnPartialError: false,     // 部分扩展失败时是否抛出异常
})

// 方式二：先验证再注册
const result = manager.validateAndRegisterPackage(myPackage)
if (!result.success) {
  console.error('注册失败:', result.errors)
}
```

#### 2.2.3 注册返回结果

```javascript
{
  success: true,                          // 是否全部成功
  package: { /* 包信息 */ },              // 注册后的包对象
  registeredExtensions: [                 // 成功注册的扩展
    { index: 0, id: 'ext-id', pointName: 'crm.customer.list' }
  ],
  failedExtensions: [                     // 失败的扩展
    { index: 1, point: 'crm.customer.detail', message: '错误信息' }
  ],
  errors: [ /* Error对象列表 */ ]
}
```

### 2.3 扩展包注册流程（后端）

后端扩展服务位于 [backend/src/Service/ExtensionService.php](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/backend/src/Service/ExtensionService.php)。

#### 2.3.1 RESTful API

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/packages/validate` | 验证扩展包 |
| POST | `/api/packages` | 注册扩展包 |
| GET | `/api/packages` | 获取所有扩展包 |
| GET | `/api/packages/:id` | 获取单个扩展包 |
| DELETE | `/api/packages/:id` | 删除扩展包 |
| POST | `/api/packages/:id/rollback` | 回滚扩展包 |

#### 2.3.2 后端注册流程

1. **验证阶段** ([validatePackageRegistration](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/backend/src/Service/ExtensionService.php#L17-L81))
   - 检查包ID格式和唯一性
   - 验证版本号格式
   - 遍历验证每个扩展定义
   - 检测潜在冲突

2. **注册阶段** ([registerPackage](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/backend/src/Service/ExtensionService.php#L215-L249))
   - 保存包信息到 `packages` 表
   - 遍历注册每个扩展到 `extensions` 表
   - 处理扩展冲突并记录到 `override_conflicts` 表
   - 创建回滚记录到 `package_rollbacks` 表

### 2.4 使用Pinia Store注册（推荐）

前端提供了Pinia Store封装，位于 [extension.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/store/extension.js)。

```javascript
import { useExtensionStore } from './store/extension'

const store = useExtensionStore()

// 1. 初始化（从后端同步数据）
await store.init()

// 2. 验证扩展包
const validation = await store.validatePackage(myPackage)
if (!validation.valid) {
  console.error('验证失败:', validation.errors)
  return
}

// 3. 注册扩展包
const result = await store.registerPackage(myPackage)

// 4. 检查覆盖影响
const impact = await store.checkOverrideImpact('crm-advanced-features')
console.log('覆盖影响:', impact)

// 5. 如需回滚
await store.rollbackPackage('crm-advanced-features')
```

---

## 3. 覆盖检查机制

### 3.1 冲突类型

| 冲突类型 | 触发条件 | 说明 |
|----------|----------|------|
| **explicit_override** | 显式指定 `override: true` 和 `overrideTargets` | 明确覆盖指定的扩展 |
| **single_point_conflict** | 扩展点配置 `multiple: false` | 单扩展模式下已有扩展存在 |

### 3.2 覆盖策略（Override Strategies）

定义于 [constants.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/constants.js#L1-L7)

| 策略 | 值 | 行为 |
|------|-----|------|
| **THROW** | `throw` | 抛出异常，阻止注册 |
| **LAST_WINS** | `last_wins` | 后注册的扩展生效，旧扩展被禁用 |
| **FIRST_WINS** | `first_wins` | 先注册的扩展保留，新扩展标记为冲突 |
| **MERGE** | `merge` | 合并两个扩展的props和metadata |
| **STACK** | `stack` | 保留所有扩展，按优先级排序 |

### 3.3 覆盖检查流程

#### 3.3.1 前端检查

[\_checkOverrideConflict](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/ExtensionPointManager.js#L635-L673) 方法负责冲突检测：

```javascript
// 1. 检查显式覆盖目标
if (newExt.override && newExt.overrideTargets.includes(existingExt.id)) {
  // 标记为 incoming_replaces_existing
}

// 2. 检查反向覆盖
if (existingExt.override && existingExt.overrideTargets.includes(newExt.id)) {
  // 标记为 existing_replaces_incoming
}

// 3. 检查单扩展点冲突
if (!pointConfig.multiple && existingExtensions.length > 0) {
  // 根据扩展点策略处理
}
```

#### 3.3.2 冲突处理

[\_handleOverrideConflicts](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/ExtensionPointManager.js#L675-L752) 根据策略处理冲突：

```javascript
switch (strategy) {
  case 'throw':
    throw new OverrideConflictError(pointName, existing, newExt)
  case 'last_wins':
    existing.state = 'disabled'
    newExt.state = 'active'
    break
  case 'first_wins':
    newExt.state = 'override_conflict'
    break
  case 'merge':
    mergedExt = { ...existing, ...newExt, props: { ...existing.props, ...newExt.props } }
    break
  case 'stack':
    // 全部保留，按priority和order排序
    break
}
```

### 3.4 覆盖影响检查

在注册前可使用 [checkOverrideImpact](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/ExtensionPointManager.js#L897-L948) 预检查影响：

```javascript
const impact = manager.checkOverrideImpact('package-id')
// 返回:
{
  canInstall: true,        // 是否可安装
  conflicts: [             // 潜在冲突列表
    {
      type: 'single_point_conflict',
      pointName: 'crm.customer.header',
      existingExtension: 'existing-ext-id',
      existingPackage: 'existing-package-id',
      incomingExtension: 'new-ext-id',
      resolution: 'last_wins',
      blocksInstallation: false
    }
  ],
  warnings: []             // 警告信息
}
```

### 3.5 使用 useOverrideChecker Composable

[composables.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/composables.js#L92-L118) 提供了响应式检查：

```javascript
import { useOverrideChecker } from './plugin/composables'

const {
  impact,           // 响应式影响结果
  canInstall,       // 计算属性：是否可安装
  conflicts,        // 计算属性：冲突列表
  warnings,         // 计算属性：警告列表
  hasConflicts,     // 计算属性：是否有冲突
  forceRegister     // 强制注册方法
} = useOverrideChecker('package-id')
```

---

## 4. 环境变量配置

### 4.1 后端环境变量

后端配置位于 [backend/config/config.php](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/backend/config/config.php)

| 环境变量 | 说明 | 默认值 |
|----------|------|--------|
| `DB_DRIVER` | 数据库驱动 | `sqlite` |
| `DB_HOST` | 数据库主机 | `127.0.0.1` |
| `DB_PORT` | 数据库端口 | `3306` |
| `DB_DATABASE` | 数据库名称/路径 | `__DIR__/../../db/extensions.sqlite` |
| `DB_USERNAME` | 数据库用户名 | `root` |
| `DB_PASSWORD` | 数据库密码 | `` |

**配置示例：**

```bash
# SQLite (默认)
export DB_DRIVER=sqlite
export DB_DATABASE=/path/to/database.sqlite

# MySQL
export DB_DRIVER=mysql
export DB_HOST=localhost
export DB_PORT=3306
export DB_DATABASE=crm_extensions
export DB_USERNAME=admin
export DB_PASSWORD=secret
```

### 4.2 后端配置项

除环境变量外，还可在 `config.php` 中配置：

```php
return [
    'api' => [
        'prefix' => '/api',              // API前缀
        'cors'   => true,                // 是否启用CORS
    ],
    'override' => [
        'default_strategy' => 'last_wins',  // 默认覆盖策略
        'strategies'       => ['throw', 'last_wins', 'first_wins', 'merge', 'stack'],
        'strict_mode'      => false,     // 严格模式
    ],
];
```

### 4.3 前端环境变量

前端使用Vite，可通过 `.env` 文件配置：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `VITE_API_BASE` | 后端API基础路径 | `/api` |
| `VITE_APP_PORT` | 开发服务器端口 | `3000` |
| `VITE_API_TARGET` | 代理目标 | `http://localhost:8000` |

**.env.development 示例：**

```dotenv
VITE_APP_PORT=3000
VITE_API_BASE=/api
VITE_API_TARGET=http://localhost:8000
```

### 4.4 前端管理器运行时配置

在创建扩展管理器时可配置运行时参数：

```javascript
createExtensionPlugin({
  defaultStrategy: 'last_wins',      // 默认覆盖策略
  logLevel: 1,                       // 日志级别: 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
  onConflict: (conflict) => {        // 冲突回调
    console.warn('检测到冲突:', conflict)
  },
  strictOverride: false,             // 严格覆盖模式
  enablePermissionCheck: false,      // 启用权限检查
  defaultScope: 'public',            // 默认权限范围: public/internal/admin
  permissionChecker: (action, scope, options) => {
    // 自定义权限检查
    return true
  },
  scopeResolver: () => {
    // 自定义范围解析
    return getCurrentUserScope()
  },
})
```

---

## 5. 验收命令

### 5.1 前端命令

定义于 [frontend/package.json](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/package.json#L6-L13)

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动开发服务器 (端口3000) |
| `npm run build` | 生产环境构建，输出到 `dist/` |
| `npm run preview` | 预览生产构建 |
| `npm run test` | 运行所有测试 (单次) |
| `npm run test:watch` | 运行测试 (监听模式) |
| `npm run test:ui` | 运行测试 (UI模式) |

### 5.2 后端命令

定义于 [backend/composer.json](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/backend/composer.json#L15-L18)

| 命令 | 说明 |
|------|------|
| `composer run serve` | 启动PHP内置服务器 (端口8000) |
| `composer run db:init` | 初始化数据库 |

### 5.3 测试套件

测试文件位于 [frontend/src/plugin/__tests__/](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/__tests__/)

| 测试文件 | 覆盖内容 |
|----------|----------|
| [ExtensionPointManager.spec.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/__tests__/ExtensionPointManager.spec.js) | 扩展管理器核心功能 |
| [plugin.spec.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/__tests__/plugin.spec.js) | Vue插件集成 |
| [validator.spec.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/__tests__/validator.spec.js) | 数据验证器 |

**运行测试：**

```bash
cd frontend
npm run test

# 带覆盖率
npm run test -- --coverage
```

### 5.4 健康检查命令

**检查前端构建：**
```bash
cd frontend
npm run build
# 验证dist目录是否生成
ls -la dist/
```

**检查后端服务：**
```bash
cd backend
composer run serve &
sleep 2
curl -s http://localhost:8000/api/ | python3 -m json.tool
```

**检查扩展点API：**
```bash
# 获取统计信息
curl http://localhost:8000/api/

# 获取扩展点列表
curl http://localhost:8000/api/points

# 获取扩展包列表
curl http://localhost:8000/api/packages
```

### 5.5 扩展包注册验收测试

```bash
# 1. 定义扩展点
curl -X POST http://localhost:8000/api/points \
  -H "Content-Type: application/json" \
  -d '{"name":"crm.customer.list.toolbar","strategy":"last_wins","multiple":true}'

# 2. 验证扩展包
curl -X POST http://localhost:8000/api/packages/validate \
  -H "Content-Type: application/json" \
  -d '{"id":"test-pkg","name":"测试包","version":"1.0.0","extensions":[{"point":"crm.customer.list.toolbar"}]}'

# 3. 注册扩展包
curl -X POST http://localhost:8000/api/packages \
  -H "Content-Type: application/json" \
  -d '{"id":"test-pkg","name":"测试包","version":"1.0.0","extensions":[{"point":"crm.customer.list.toolbar","component":"TestButton"}]}'

# 4. 检查覆盖影响
curl http://localhost:8000/api/packages/test-pkg/check-override

# 5. 回滚测试
curl -X POST http://localhost:8000/api/packages/test-pkg/rollback
```

---

## 6. 快速开始

### 6.1 环境要求

- Node.js >= 16
- PHP >= 8.1
- PDO Extension (PHP)
- JSON Extension (PHP)

### 6.2 启动开发环境

```bash
# 1. 安装依赖
cd frontend && npm install
cd ../backend && composer install

# 2. 配置环境变量
cp backend/.env.example backend/.env
# 编辑数据库配置

# 3. 启动后端 (端口8000)
cd backend && composer run serve

# 4. 启动前端 (端口3000)
cd frontend && npm run dev

# 5. 运行测试
cd frontend && npm run test
```

### 6.3 生产部署

```bash
# 1. 构建前端
cd frontend
npm install --production
npm run build

# 2. 部署后端
cd backend
composer install --no-dev --optimize-autoloader

# 3. 配置Web服务器
# Nginx: 配置伪静态和CORS
# Apache: 确保.htaccess生效

# 4. 设置环境变量
export DB_DRIVER=mysql
export DB_HOST=prod-db-host
export DB_DATABASE=crm_prod
export DB_USERNAME=crm_user
export DB_PASSWORD=strong-password

# 5. 初始化数据库
composer run db:init

# 6. 启动服务
# 使用PHP-FPM或其他PHP处理程序
```

---

## 7. 常见问题

### 7.1 扩展注册失败怎么办？

1. 检查扩展点是否已定义：`manager.getPoint('point-name')`
2. 验证扩展包格式：`manager.validatePackageRegistration(pkg)`
3. 检查覆盖目标是否存在：`manager.getExtensions('point-name')`
4. 查看控制台日志 (设置 `logLevel: 0` 查看详细日志)

### 7.2 如何调试冲突问题？

```javascript
// 1. 启用详细日志
const { manager } = createExtensionPlugin({ logLevel: 0 })

// 2. 监听冲突事件
manager.on('conflict:detected', (conflict) => {
  console.debug('冲突详情:', conflict)
})

// 3. 查看所有冲突
const conflicts = manager.getConflicts({ unresolved: true })
console.log('未解决冲突:', conflicts)
```

### 7.3 扩展点和扩展的命名规范？

- **扩展点名称**: 点分隔标识符，如 `crm.customer.detail.action`
- **扩展包ID**: 字母开头，可包含 `_-` 和点，如 `crm-advanced-features`
- **扩展ID**: 可选，建议格式 `packageId::pointName::suffix`

具体验证规则见 [validator.js](file:///Users/wuzhijie/Documents/xiaohongshu/biaozhu/tishiwen/001-CRM客户跟进系统/frontend/src/plugin/validator.js)

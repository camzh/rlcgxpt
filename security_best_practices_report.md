# 货源看板小程序 — 信息安全审计与性能评估报告

- 审计范围：`/workspace`（微信小程序客户端 + 两个云函数）
- 审计语言/框架：JavaScript（微信小程序原生 + wx-server-sdk + tencentcloud-sdk）
- 审计日期：2026-06-29
- 审计依据：security-best-practices skill、项目 `rules/quality.md`、`rules/AGENTS.md`

## 一、执行摘要

整体上项目安全基础已具备：短信验证码登录、JWT 会话签名、频控、`LEGACY_COMPAT_TOKEN` 已从源码硬编码迁移至 `local-config.js`（已被 `.gitignore` 排除）、无 `eval/rich-text` 注入面、生产 `console.log` 已清理。但仍存在 **1 个严重**、**3 个高危**、**4 个中危**、**4 个低危** 共 12 项安全问题，其中最严重的是 `verifySmsCode` 云函数存在验证码重放攻击漏洞。

性能层面：基础优化已落地（`lazyCodeLoading`、`minified`、`ignoreUploadUnusedFiles`、`boardSignature` 去重 setData），但 **媒体上传走 base64 + JSON** 是最大性能/内存瓶颈，其次为深拷贝全量数据与无分页列表。

---

## 二、安全审计发现

### 严重

#### SEC-01 验证码重放攻击（已使用验证码可再次登录）

- **影响**：攻击者获取一次验证码后，可在 5 分钟有效期内用同一验证码为任意微信 openid 换取会话 token，绕过短信验证码单次使用约束，可冒名登录。
- **位置**：[cloudfunctions/verifySmsCode/index.js#L116-L120](file:///workspace/cloudfunctions/verifySmsCode/index.js)
- **代码**：

```js
if (row.used) {
  if (String(row.code || "") === normalizedCode && Number(row.expireAtMs || 0) > Date.now()) {
    return buildSessionResult();   // 已使用且未过期 → 直接放行
  }
  return { success: false, error: "验证码已使用，请重新获取" };
}
```

- **根因**：fallback 分支（`records.length === 0`）下，若最新一条记录 `used=true` 但 code 匹配且未过期，直接签发新会话。这违背“验证码一次性”原则。
- **建议**：删除该 `row.used` 分支中“code 匹配即放行”的逻辑；已使用记录只允许返回“已使用，请重新获取”。如需重试友好，可在发送阶段判断最近一条未过期且未使用即复用，而非在验证阶段重放。

---

### 高危

#### SEC-02 `LEGACY_COMPAT_TOKEN` 兜底头可绕过短信验证

- **影响**：当小程序会话 token 缺失时，自动携带 `x-juzhen-token` 头访问后端。一旦 `services/local-config.js` 中的 token 泄露（小程序包可被反编译，wx.storage 不加密），攻击者可绕过短信验证码直接调用所有 mini API。
- **位置**：[services/cloud-api.js#L60-L62](file:///workspace/services/cloud-api.js)
- **代码**：

```js
if (miniSessionToken) {
  headers.Authorization = `Bearer ${miniSessionToken}`;
} else if (LEGACY_COMPAT_TOKEN) {
  headers["x-juzhen-token"] = LEGACY_COMPAT_TOKEN;
}
```

- **根因**：保留了网页端兼容后门作为兜底认证，且后端若仍信任该头则形成认证旁路。`doc/追踪简报-20260624.md` 已记录此问题“连续 3 日未修复”。
- **建议**：确认后端已下线 `x-juzhen-token` 接受逻辑后，删除该 `else if` 分支与 `local-config.example.js` 中的 `LEGACY_COMPAT_TOKEN` 字段；若必须保留过渡期，应加日志告警并设硬过期时间。

#### SEC-03 验证码明文存储于云数据库

- **影响**：`sms_codes` 集合的 `code` 字段以明文 6 位数字存储。云数据库权限配置不当或后台导出时，验证码可直接被读出，配合手机号即可登录任意账号。
- **位置**：[cloudfunctions/sendSms/index.js#L121-L132](file:///workspace/cloudfunctions/sendSms/index.js)
- **建议**：存库前用 `crypto.createHash("sha256").update(code + phone + openid).digest("hex")` 哈希；验证时同样哈希后比对。同时给 `sms_codes` 集合配置最小化权限（仅云函数可读写，禁止客户端读）。

#### SEC-04 VConsole 调试工具在生产开启

- **影响**：`enableVConsole: "open"` 同时存在于 android 与 iOS 配置，会在线上版本注入 vConsole 调试面板，泄露网络请求、storage、token 给任意用户。
- **位置**：[project.miniapp.json#L32, L48](file:///workspace/project.miniapp.json)
- **建议**：正式版构建时改为 `close`，或仅 debug 版本开启。

---

### 中危

#### SEC-05 `verifySmsCode` fallback 跨 openid 使用验证码

- **影响**：主查询（openid+phone+code）未命中时，fallback 仅按 phone+code 查询，允许 A openid 收到 B 手机号验证码后用自己 openid 登录。虽受限于“验证码发到真实手机”，但若手机号被冒用（如客服诱导），可绕过 openid 绑定。
- **位置**：[cloudfunctions/verifySmsCode/index.js#L88-L98](file:///workspace/cloudfunctions/verifySmsCode/index.js)
- **建议**：删除 phone-only fallback，或在 fallback 命中后强制将 record 的 openid 更新为当前 openid 再放行，并记录原 openid 用于审计。

#### SEC-06 `wx.cloud.init` 硬编码云环境 ID 且 `traceUser: true`

- **影响**：云环境 ID `cloudbase-d9gehmfnxf8b53557` 泄露后可被用于探测云函数；`traceUser: true` 会记录用户访问日志，需在隐私政策中声明。
- **位置**：[app.js#L38](file:///workspace/app.js)
- **建议**：云环境 ID 移至 `local-config.js`；确认 `隐私政策` 页面已声明 traceUser 收集行为。

#### SEC-07 `sitemap.json` 全量允许索引

- **影响**：`"action": "allow", "page": "*"` 使所有页面（含 `register`、`admin-approvals`）可被微信搜索索引，扩大攻击面。
- **位置**：[sitemap.json](file:///workspace/sitemap.json)
- **建议**：改为仅允许 `board`、`mine` 等公开页索引，敏感页显式 `disallow`。

#### SEC-08 媒体上传无大小/类型校验

- **影响**：`wx.chooseMedia` 未指定 `sizeType`、`extension`、文件大小上限；上传走 base64 后任意大文件都会读入内存并膨胀 33%，可被恶意用户用来构造 OOM 或超大请求体。
- **位置**：[pages/form/index.js#L440-L453](file:///workspace/pages/form/index.js)、[pages/demand-form/index.js#L248](file:///workspace/pages/demand-form/index.js)
- **建议**：`chooseMedia` 增加 `sizeType: ['compressed']`、`extension` 白名单；上传前用 `wx.getFileInfo` 校验大小（图片 < 5MB、视频 < 50MB）。

---

### 低危

#### SEC-09 `project.config.json` 关闭 URL 合法性校验

- **位置**：[project.config.json#L9](file:///workspace/project.config.json) `"urlCheck": false`
- **影响**：仅影响开发模式，生产小程序需在管理后台配置 request 合法域名。但若该配置流入生产构建脚本，会跳过域名白名单检查。
- **建议**：保留开发期 `false` 即可，确认生产上传时由微信平台后台域名白名单兜底。

#### SEC-10 seed 用户数据混入权限判断

- **影响**：`mock/data.js` 的种子用户（王经理/李娜/张三）被 `getUsers()` 合并进真实用户列表，`getCreatorUserForItem` 用 name/phone 匹配，可能将远程货源误匹配到种子用户 id，影响 `canEditItem`/`canReviewItem` 权限判断。
- **位置**：[services/inventory.js#L121-L142](file:///workspace/services/inventory.js)、[services/inventory.js#L464-L471](file:///workspace/services/inventory.js)
- **建议**：生产构建剥离 `mock/data.js`，或 `getUsers()` 仅返回 `authService.getUsers()`，种子数据仅在无登录态的开发环境注入。

#### SEC-11 `setStorageSafely` 异常时先 remove 再 set，存在数据丢失窗口

- **位置**：[services/inventory.js#L201-L208](file:///workspace/services/inventory.js)
- **影响**：`setStorageSync` 抛错（如超 10MB 上限）时先 remove 再 set，若 set 二次失败，本地数据被清空。
- **建议**：remove 前先备份旧值到临时 key，set 失败时回滚。

#### SEC-12 云函数 `console.error` 打印完整 err 对象

- **位置**：[cloudfunctions/sendSms/index.js#L44,L116,L134](file:///workspace/cloudfunctions/sendSms/index.js)、[verifySmsCode/index.js#L101,L137,L155](file:///workspace/cloudfunctions/verifySmsCode/index.js)
- **影响**：腾讯云 SDK 错误对象可能包含RequestId、Credential 片段，日志泄露风险中等。
- **建议**：仅打印 `err.message` 与 `err.code`，不打印完整对象。

---

## 三、性能优化评估

### 高优先级

#### PERF-01 媒体上传改 base64+JSON 为 multipart 直传

- **问题**：`uploadMedia` 把图片/视频整文件读成 base64，再以 JSON 字段 `data:${mimeType};base64,...` 发送。base64 膨胀 33%，且整个文件驻留内存，大视频易触发 `setStorageSync fail` 与 OOM。
- **位置**：[services/cloud-api.js#L153-L179](file:///workspace/services/cloud-api.js)
- **建议**：改用 `wx.uploadFile`（multipart/form-data），后端用 `multer`/`formidable` 接收，文件流式落盘，内存恒定。

#### PERF-02 深拷贝全量数据

- **问题**：`clone = JSON.parse(JSON.stringify(data))` 在 `getItems`/`getNotifications`/`getLogs`/`saveItems` 每次调用都全量深拷贝，数据上百条时 setData 卡顿明显。
- **位置**：[utils/helpers.js#L17-L19](file:///workspace/utils/helpers.js)、[services/inventory.js#L173](file:///workspace/services/inventory.js)、[services/notifications.js#L3-L5](file:///workspace/services/notifications.js)
- **建议**：读路径返回浅拷贝（`items.map(x => ({...x}))`）即可；写路径直接 `wx.setStorageSync(key, value)` 无需 clone（storage API 本身会序列化）。

#### PERF-03 board 页面计数重复计算

- **问题**：`supplyCount` 在非 supply tab 下仍调用 `service.getBoardData({ ...status:"all", sourceFilter:"all" })` 全量过滤一次，仅为取 length。
- **位置**：[pages/board/index.js#L166-L171](file:///workspace/pages/board/index.js)
- **建议**：新增 `getBoardCount(filters)` 只走 filter 不走 decorate，或缓存 count。

### 中优先级

#### PERF-04 `cloudDataSignature` 全量 JSON.stringify

- **问题**：`app.js` 的 `cloudDataSignature` 把两个 storage key 整数组 `JSON.stringify` 用于变化检测，120 秒一次，数据量大时耗时。
- **位置**：[app.js#L14-L23](file:///workspace/app.js)
- **建议**：仅比较 length + 末尾元素的 id/updatedAt（`boardSignature` 已采用此法，可复用）。

#### PERF-05 列表无分页/虚拟列表

- **问题**：`getBoardData` 一次性返回所有匹配项并 setData，列表超 100 条时渲染与 setData 性能下降。
- **位置**：[services/inventory.js#L889-L896](file:////workspace/services/inventory.js)
- **建议**：列表层做虚拟滚动（`recycle-view`）或服务端分页（当前后端 `/api/mini/items` 一次返回全量，需后端配合）。

#### PERF-06 `filterItems` 多次链式遍历

- **问题**：`getItems().map(normalizeLegacyItem).filter(...).filter(...)...sort().map(decorateItem)` 6 次以上遍历。
- **位置**：[services/inventory.js#L812-L887](file:///workspace/services/inventory.js)
- **建议**：合并 filter 为单次回调，`normalizeLegacyItem` 在存储时即做（写入时规范化），读取时直接用。

### 低优先级（已具备，建议保持）

- **PERF-07** `lazyCodeLoading: "requiredComponents"`、`minified`、`minifyWXSS/WXML`、`ignoreUploadUnusedFiles` 已启用 — 保持。
- **PERF-08** `boardSignature` 防重复 setData、`onKeywordChange` 300ms 防抖、`SYNC_INTERVAL_MS=120000` 节流 — 设计合理，保持。

---

## 四、修复优先级与建议顺序

| 优先级 | 编号 | 建议顺序 |
| --- | --- | --- |
| P0 | SEC-01 | 立即删除 `verifySmsCode` 已使用验证码放行分支 |
| P0 | SEC-02 | 与后端确认下线 `x-juzhen-token` 后删除兜底逻辑 |
| P1 | SEC-03, SEC-04 | 验证码哈希存储；生产关 VConsole |
| P1 | PERF-01 | 媒体上传改 multipart |
| P2 | SEC-05~SEC-08 | fallback 收敛、云环境 ID 入配置、sitemap 收敛、上传校验 |
| P2 | PERF-02, PERF-03 | 深拷贝精简、count 去重 |
| P3 | SEC-09~SEC-12, PERF-04~PERF-06 | 其余优化项 |

---

## 五、未验证项与残余风险

1. **后端服务端未审计**：本报告仅覆盖小程序客户端与两个云函数，`https://rlcgxpt.com` 的 `server.js` 未在仓库内，无法确认 `x-juzhen-token` 是否已下线、JWT 签名密钥是否与 `MINI_SESSION_SECRET` 一致、`sms_codes` 集合权限配置。
2. **微信云数据库权限规则**：`sms_codes` 集合是否对客户端关闭读权限需在云开发控制台核对。
3. **`local-config.js` 真实内容**：已被 `.gitignore` 排除，无法确认 `LEGACY_COMPAT_TOKEN` 是否仍写入非空值。

建议下一步：将本报告 P0 项交后端联调确认后落地修复，并补充服务端 `server.js` 的安全审计。

# ChatOS UI Apps：`module` 入口与 Host API（协议）

本文件定义 UI Apps 的 `module` 入口规范，以及宿主注入的 `host` 对象（应用与 ChatOS 交互的稳定契约）。

实现对照（以代码为准）：

- `deepseek_cli/apps/ui/src/features/apps/AppsPluginView.jsx`

## 1. module 入口规范

`plugin.json` 中的入口示例：

```json
{ "type": "module", "path": "my-app/index.mjs" }
```

入口模块需导出 `mount`（以下三种写法宿主都接受）：

- `export function mount(...) { ... }`
- `export default { mount(...) { ... } }`
- `export default function mount(...) { ... }`

`mount` 签名：

```js
export function mount({ container, host, slots }) {
  return () => {}; // or return { dispose() {} }
}
```

- `container`：应用正文容器（body）
- `slots.header`：可选固定 Header 容器（不随 body 滚动）
- 返回值：
  - `() => void|Promise<void>`：卸载回调；或
  - `{ dispose(): void|Promise<void> }`

布局规范：

- 不要使用 `window/body` 作为滚动容器；把滚动放到应用内部。
- 将 Tabs/二级导航/操作按钮等放到 `slots.header`，可滚动内容放到 `container`。

Surface 说明：

- 宿主可能在不同 **surface** 下挂载应用（如 `full` 全屏、`compact` 侧边抽屉/分栏）。
- 若 `plugin.json` 提供 `entry.compact`，宿主在 compact surface 会优先加载该入口。
- 当前 surface 通过 `host.context.get().surface` 暴露（`"full"` / `"compact"`）。

## 2. Host Bridge 可用性

宿主仅在“file-based entry + preload bridge 可用”的情况下提供 `host` 能力；否则会抛错：

- 若你在非 ChatOS 宿主环境下单独打开页面（或 preload 未加载），`host.bridge.enabled` 可能为 `false`。
- 生产场景（桌面端应用内）一般为 `true`。

## 3. `host` API 约定

### 3.1 上下文与主题

- `host.bridge.enabled: boolean`
- `host.context.get(): { pluginId, appId, theme, surface, bridge: { enabled } }`
- `host.theme.get(): string`（当前实现读取 `document.documentElement.dataset.theme`）
- `host.theme.onChange(listener): () => void`

补充说明：

- `theme` 取值通常为 `light` / `dark`，宿主会通过 `document.documentElement.dataset.theme` 下发。
- 本地沙箱右上角提供 Theme 切换（light/dark/system），用于测试 `host.theme.onChange` 与样式响应。
- 建议使用宿主的 CSS Tokens（`--ds-*`）对齐主题与视觉，例如 `--ds-panel-bg` / `--ds-panel-border` / `--ds-subtle-bg` / `--ds-focus-ring` / `--ds-code-bg` / `--ds-code-border`。

### 3.2 Admin（全局配置读取）

- `host.admin.state(): Promise<any>`：读取全局 Admin 状态快照
- `host.admin.onUpdate(listener): () => void`：订阅 Admin 更新事件
- `host.admin.models.list(): Promise<any>`：列出 Models
- `host.admin.secrets.list(): Promise<any>`：列出 Secrets（脱敏；不会返回明文 key）

说明：

- UI Apps **不得**在自己的配置里保存/管理 API Keys；应完全复用宿主全局配置。

### 3.3 Registry（插件注册表）

- `host.registry.list(): Promise<any>`：等价于 `uiApps:list`（包含 apps 列表、插件目录、加载错误等）

### 3.4 Backend（插件后端调用）

- `host.backend.invoke(method: string, params?: any): Promise<any>`
  - `method`：后端 `methods` 的 key
  - 返回值：后端方法返回的 `result`（宿主会把 `{ ok, result }` 解包）

后端协议详见：[CHATOS_UI_APPS_BACKEND_PROTOCOL.md](./CHATOS_UI_APPS_BACKEND_PROTOCOL.md)。

### 3.5 UI Prompts（右下角笑脸：交互待办）

用于把“需要用户确认/输入”的交互投递到全局队列，用户无需进入对应应用即可处理。

- `host.uiPrompts.read(): Promise<any>`：读取当前队列/最新状态
- `host.uiPrompts.onUpdate(listener): () => void`：订阅队列变化
- `host.uiPrompts.request({ prompt, runId?, requestId?, ... }): Promise<any>`：投递待办（`prompt.source` 为空时宿主写入 `${pluginId}:${appId}`）
- `host.uiPrompts.respond({ requestId, runId?, response }): Promise<any>`：写入用户响应
- `host.uiPrompts.open(): { ok: true }`：打开笑脸面板
- `host.uiPrompts.close(): { ok: true }`
- `host.uiPrompts.toggle(): { ok: true }`

`prompt` / `response` 的字段协议见：[CHATOS_UI_PROMPTS_PROTOCOL.md](./CHATOS_UI_PROMPTS_PROTOCOL.md)。

### 3.6 导航

- `host.ui.navigate(menu: string): { ok: true }`
  - 用于跨应用/跨页面跳转（由宿主统一处理路由）
- `host.ui.surface: "full" | "compact"`（当前 surface，等价于 `host.context.get().surface`）

### 3.7 Chat（Agents / Sessions / Messages / Send / Events）

`host.chat` 提供对聊天域的直接操作能力（节选）：

- `host.chat.agents.list()`
- `host.chat.agents.ensureDefault()`
- `host.chat.agents.create(payload)`
- `host.chat.agents.update(id, patch)`
- `host.chat.agents.delete(id)`
- `host.chat.agents.createForApp({ name?, description?, modelId?, promptIds?, subagentIds?, skills?, mcpServerIds? })`
  - 创建一个“绑定当前应用”的 Agent，并自动写入 `uiApps: [{ pluginId, appId, mcp:true, prompt:true }]`
- `host.chat.sessions.list()`
- `host.chat.sessions.ensureDefault(payload?)`
- `host.chat.sessions.create(payload)`
- `host.chat.messages.list(payload)`
- `host.chat.send(payload)`
- `host.chat.abort(payload)`
- `host.chat.events.subscribe({ sessionId?, types? }, listener): () => void`
- `host.chat.events.unsubscribe(): { ok: true }`

事件订阅说明：

- `subscribe` 支持用 `sessionId` 与 `types` 做过滤；
- 当最后一个 listener 解绑后，宿主会自动取消底层订阅。

# ChatOS UI Apps：`plugin.json` 清单规范（协议）

本文件定义 UI Apps 插件清单 `plugin.json` 的字段与约束，目标是让第三方/内置应用都能按统一契约被 ChatOS 扫描、加载与运行。

实现对照（以代码为准）：

- schema：`deepseek_cli/electron/ui-apps/schemas.js`
- 扫描/校验：`deepseek_cli/electron/ui-apps/index.js`
- 导入/安装：`deepseek_cli/electron/ui-apps/plugin-installer.js`

另见：

- [`CHATOS_UI_APPS_HOST_API.md`](./CHATOS_UI_APPS_HOST_API.md)（`module` 应用与宿主交互）
- [`CHATOS_UI_APPS_BACKEND_PROTOCOL.md`](./CHATOS_UI_APPS_BACKEND_PROTOCOL.md)（插件后端）
- [`CHATOS_UI_APPS_AI_CONTRIBUTIONS.md`](./CHATOS_UI_APPS_AI_CONTRIBUTIONS.md)（MCP/Prompt 暴露）

## 1. 文件与安装位置

- 每个插件一个目录，目录根部必须包含 `plugin.json`。
- 插件目录可放在：
  - `deepseek_cli/ui_apps/plugins`（内置/开发）
  - `~/.deepseek_cli/chatos/ui_apps/plugins`（用户插件目录）
- 也可通过桌面端 UI：`应用` → `导入应用包`（目录或 `.zip`）安装到用户插件目录。

## 2. 顶层 schema（`uiAppsPluginSchema`）

`plugin.json`（Top-level）字段：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---:|---:|---|---|
| `manifestVersion` | `number` | 否 | `1` | 目前仅支持 `1` |
| `id` | `string` | 是 | - | 插件 ID（使用反向域名；稳定且全局唯一） |
| `name` | `string` | 是 | - | 插件显示名称 |
| `version` | `string` | 否 | `"0.0.0"` | 版本号（展示用途） |
| `description` | `string` | 否 | `""` | 插件描述 |
| `backend` | `object` | 否 | - | 插件后端（Electron main 进程） |
| `apps` | `array` | 否 | `[]` | 插件内的应用列表 |

`backend`：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `backend.entry` | `string` | 是 | 后端入口模块路径（相对插件目录；必须在插件目录内且是文件） |

## 3. apps schema（`uiAppSchema`）

`apps[i]` 字段：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---:|---:|---|---|
| `id` | `string` | 是 | - | 应用 ID（同一插件内唯一） |
| `name` | `string` | 是 | - | 应用显示名称 |
| `description` | `string` | 否 | `""` | 描述 |
| `icon` | `string` | 否 | `""` | 图标（当前实现以字符串透传为主） |
| `entry` | `object` | 是 | - | 入口（仅支持 `module`） |
| `ai` | `object|string` | 否 | - | AI 声明（MCP/Prompt/暴露列表等；详见下文） |

### 3.1 `apps[i].entry`（仅支持 `module`）

```json
{ "type": "module", "path": "my-app/index.mjs" }
```

可选：为“侧边抽屉/分栏/非全屏”等 **compact surface** 提供专门入口：

```json
{
  "type": "module",
  "path": "my-app/index.mjs",
  "compact": { "type": "module", "path": "my-app/compact.mjs" }
}
```

硬约束：

- `entry.type` 必须为 `"module"`（ChatOS 不支持 `iframe/url`）。
- `entry.path` 必须在插件目录内（宿主做路径边界校验），且必须是文件。
- `entry.compact` 为可选；若提供，`entry.compact.path` 同样必须在插件目录内且必须是文件。

## 4. `apps[i].ai` schema（`uiAppAiSchema`）

`ai` 可以写成两种形式：

1) **对象**（inline）：

```json
{
  "ai": {
    "mcpServers": true,
    "prompts": true
  }
}
```

2) **字符串路径**（等价于 `{ "config": "<path>" }`）：

```json
{ "ai": "my-app/ai.yaml" }
```

对象形式还支持额外带一个 `config` 字段，用于从文件读取并与 inline 合并：

```json
{
  "ai": {
    "config": "my-app/ai.yaml",
    "mcpServers": true,
    "prompts": true
  }
}
```

所有 `ai` 的 path（`ai.config`、`ai.mcp.entry`、`ai.mcpPrompt.*.path`）都必须在插件目录内，且文件大小受限（默认最大 `128 KiB`）。

### 4.1 `ai` 字段一览（`uiAppAiConfigSchema`）

| 字段 | 类型 | 说明 |
|---|---:|---|
| `ai.mcp` | `object` | 声明并同步一个 MCP Server（`serverName` 固定派生为 `${pluginId}.${appId}`） |
| `ai.mcpPrompt` | `string|object` | 声明并同步一个 system prompt（名称固定派生） |
| `ai.mcpServers` | `true|false|string[]` | 暴露给 Agent 的 MCP servers 范围（聚合“已有的”资源） |
| `ai.prompts` | `true|false|string[]` | 暴露给 Agent 的 prompts 范围（聚合“已有的”资源） |
| `ai.agent` | `object` | 可选：应用提供的 Agent 模板（当前实现主要做透传/保留字段） |

## 5. `ai.mcp`：MCP Server 声明

`ai.mcp` 字段（当前 schema）：

| 字段 | 类型 | 必填 | 默认 | 说明 |
|---|---:|---:|---|---|
| `url` | `string` | 二选一 | - | 远程 MCP Server 地址（`http(s)://` / `ws(s)://` 等） |
| `entry` | `string` | 二选一 | - | 本地脚本入口（相对插件目录）；宿主会转换为 `cmd://...` |
| `command` | `string` | 否 | `"node"` | 拉起本地 `entry` 时使用的命令 |
| `args` | `string[]` | 否 | `[]` | 拉起时追加参数 |
| `callMeta` | `object` | 否 | - | 调用 MCP 工具时注入到 `_meta` 的附加字段（不会暴露给 AI）；支持 `$pluginId/$appId/$pluginDir/$dataDir/$stateDir/$sessionRoot/$projectRoot` 变量 |
| `description` | `string` | 否 | `""` | 描述 |
| `tags` | `string[]` | 否 | `[]` | 标签（宿主还会自动附加 `uiapp*` 标签） |
| `enabled` | `boolean` | 否 | - | 是否启用（未填则宿主同步时默认 `true`） |
| `allowMain` | `boolean` | 否 | - | 是否允许主流程使用（未填则宿主同步时默认 `true`） |
| `allowSub` | `boolean` | 否 | - | 是否允许子代理使用（未填则宿主同步时默认 `true`） |
| `auth` | `object` | 否 | - | 认证信息（token/basic/headers） |

强约束：

- 必须提供 `url` 或 `entry` 其中之一（只写 `command` 不算有效配置）。

`auth` 结构（均为可选，且支持 partial）：

```json
{
  "auth": {
    "token": "…",
    "basic": { "username": "u", "password": "p" },
    "headers": { "X-Foo": "bar" }
  }
}
```

当使用 `entry` 时，宿主会把它转换为可运行的 `cmd://`：

- `command` 默认为 `node`
- `args` 会追加到命令行末尾
- 宿主会把空格/引号等做安全引用，以避免路径包含空格时解析失败

`callMeta` 会随每次 `tools/call` 请求发送给 MCP server（位于 `request.params._meta`），默认会合并宿主注入的 `_meta.chatos.uiApp`（含 `pluginId/appId/pluginDir/dataDir/stateDir/sessionRoot/projectRoot`）与 `_meta.workdir`（默认等于 `dataDir`，可被 `callMeta.workdir` 覆盖）。

## 6. `ai.mcpPrompt`：应用默认 Prompt 声明

`ai.mcpPrompt` 支持两种写法：

1) **字符串**：等价于中文 prompt 从该路径读取：

```json
{ "mcpPrompt": "my-app/mcp-prompt.zh.md" }
```

2) **对象**：可分别提供 `zh`/`en`，并支持 path 或 inline content：

```json
{
  "mcpPrompt": {
    "title": "My App · MCP Prompt",
    "zh": "my-app/mcp-prompt.zh.md",
    "en": { "path": "my-app/mcp-prompt.en.md" }
  }
}
```

`zh/en` 的“source”结构为：

```json
{ "path": "relative.md", "content": "inline markdown…" }
```

约束：

- `mcpPrompt` 必须至少提供 `zh` 或 `en` 其一；
- 若提供 `path`，必须在插件目录内且是文件；
- 内容大小受限（默认最大 `128 KiB`）。

## 7. `ai.mcpServers` / `ai.prompts`：聚合暴露范围

- `true`：开启暴露（“具体暴露哪些”由 `ai.config` / 内置默认清单决定；否则表示全部）
- `false`：禁用暴露
- `string[]`：精确列出允许暴露的 `serverName` / `prompt name`

注意：这里定义的是“在 Agent UI 中可选/可见的范围”，最终是否启用、启用哪些仍由 Agent 编辑页勾选决定。

## 8. 最小示例

### 8.1 最小可运行插件（仅 module）

```json
{
  "manifestVersion": 1,
  "id": "com.example.tools",
  "name": "Example Tools",
  "version": "0.1.0",
  "apps": [
    {
      "id": "hello",
      "name": "Hello App（Module）",
      "entry": { "type": "module", "path": "hello/index.mjs" }
    }
  ]
}
```

### 8.2 带后端 + MCP/Prompt 的应用（节选）

```json
{
  "id": "db-client",
  "name": "数据库客户端",
  "entry": { "type": "module", "path": "db-client/index.mjs" },
  "ai": {
    "mcp": { "entry": "db-client/mcp-server.mjs", "command": "node", "allowMain": true, "allowSub": true },
    "mcpPrompt": { "zh": "db-client/mcp-prompt.zh.md", "en": "db-client/mcp-prompt.en.md" }
  }
}
```

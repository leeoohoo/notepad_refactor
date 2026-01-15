# ChatOS UI Apps（嵌入应用）概览

本文把散落在仓库各处的“ChatOS 嵌入应用（UI Apps 插件）框架/协议”说明提取到仓库根目录，并补齐了若干关键约束（路径边界、打包导入、schema 字段等）。

配套文档（按从概览 → 细节的阅读顺序）：

- [`CHATOS_UI_APPS_PLUGIN_MANIFEST.md`](./CHATOS_UI_APPS_PLUGIN_MANIFEST.md)：`plugin.json` / `apps[i].ai` 的清单与字段规范（含完整字段、示例与约束）。
- [`CHATOS_UI_APPS_HOST_API.md`](./CHATOS_UI_APPS_HOST_API.md)：`module` 应用入口与 `host.*` 交互协议（前端侧）。
- [`CHATOS_UI_APPS_STYLE_GUIDE.md`](./CHATOS_UI_APPS_STYLE_GUIDE.md)：主题与样式约定（CSS Tokens / 主题切换）。
- [`CHATOS_UI_APPS_TROUBLESHOOTING.md`](./CHATOS_UI_APPS_TROUBLESHOOTING.md)：常见问题与排查清单。
- [`CHATOS_UI_PROMPTS_PROTOCOL.md`](./CHATOS_UI_PROMPTS_PROTOCOL.md)：右下角笑脸「交互待办（UI Prompts）」协议（表单/单选/多选/复杂确认）。
- [`CHATOS_UI_APPS_BACKEND_PROTOCOL.md`](./CHATOS_UI_APPS_BACKEND_PROTOCOL.md)：插件后端（Electron main 进程）协议与 `ctx` 运行时上下文。
- [`CHATOS_UI_APPS_AI_CONTRIBUTIONS.md`](./CHATOS_UI_APPS_AI_CONTRIBUTIONS.md)：应用如何对 Chat Agent 暴露 MCP/Prompt（含命名规则、合并规则、内置清单机制）。

## 术语与角色

- **ChatOS（宿主）**：桌面端 Electron 应用（本仓库的 `deepseek_cli`）。
- **AIDE（引擎）**：模型调用/工具/MCP/子代理等核心能力（本仓库的 `aide`）。
- **UI Apps（嵌入应用/小应用）**：以插件形式注入到桌面端「应用」中心的应用。
- **MCP**：Model Context Protocol；通过 MCP Server 暴露 tools，最终工具名通常为 `mcp_<serverName>_<toolName>`。
- **Prompt**：system prompt 模板；可被 Agent 勾选并注入运行时 system prompt。

## 目录与状态（sessionRoot / stateDir）

- `sessionRoot`：会话根目录
  - 默认：用户主目录（Home）
  - 可通过环境变量覆盖：`MODEL_CLI_SESSION_ROOT=/path/to/root`
  - 桌面端/CLI 会把“上次使用的 sessionRoot”记录到 `<home>/.deepseek_cli/last-session-root.txt`（未设置 env 时会优先读取）
- `stateDir`：`<home>/.deepseek_cli/<hostApp>`（ChatOS 的 `hostApp=chatos`）

全局配置（由宿主维护；应用侧只读/复用）：

- `stateDir/chatos.db.sqlite`：Admin DB（Models / Secrets / MCP Servers / Prompts / Settings…）
- 文件镜像（从 Admin DB 同步出来，便于运行时读取）：
  - `stateDir/auth/models.yaml`
  - `stateDir/auth/mcp.config.json`
  - `stateDir/auth/system-prompt.yaml`
  - `stateDir/auth/*prompt*.yaml`

原则：

- **Secrets（API Keys）只存 DB**，不会明文同步到 yaml。
- 运行前宿主会把 Secrets 写入 `process.env`（受 `override` 控制），Provider 通过 `apiKeyEnv` 取值。

## UI Apps 插件目录（宿主扫描）

宿主会扫描两个目录（并在 UI「应用」页展示实际路径）：

- **内置/开发目录**：`deepseek_cli/ui_apps/plugins`
- **用户插件目录**：`<stateDir>/ui_apps/plugins`（即 `~/.deepseek_cli/chatos/ui_apps/plugins`）

同名 `plugin.id` 的覆盖规则：

- 用户目录的插件会覆盖内置目录的同 `plugin.id` 插件（便于开发调试/热替换）。

插件数据目录（供插件后端存放自己的持久化数据）：

- `dataDir`：`<stateDir>/ui_apps/data/<pluginId>`
- 插件后端的持久化数据写入目录为 `dataDir`；插件安装目录用于读取插件资源。

## 插件包导入（目录或 .zip）

桌面端 UI 支持：`应用` → `导入应用包` → 选择插件目录或 `.zip`。

包结构要求：

- `plugin.json` 在包根目录；或
- 包根目录下一层目录中包含一个或多个插件目录（每个目录内有 `plugin.json`）。

导入时的复制规则（重要）：

- 会拷贝到用户插件目录 `~/.deepseek_cli/chatos/ui_apps/plugins/<sanitized(plugin.id)>/`；
- 默认会排除：`node_modules/`、`.git/`、`.DS_Store`、`*.map`；
- 因此若插件需要依赖，请在构建时做 bundle（不要指望随包携带 `node_modules` 生效）。

## 安全边界与硬约束（协议的一部分）

为避免插件越权读取宿主文件系统，宿主对“路径型字段”做了强约束：

- `apps[i].entry.path` 必须位于插件目录内，且必须是文件（`module` 入口）。
- `apps[i].entry.compact.path`（可选）同样必须位于插件目录内，且必须是文件。
- `backend.entry` 必须位于插件目录内，且必须是文件。
- `apps[i].ai.config`、`ai.mcp.entry`、`ai.mcpPrompt.*.path` 等所有 path 都必须位于插件目录内。

尺寸限制（默认值，防止误导入超大文件）：

- `plugin.json` 最大 `256 KiB`
- `mcpPrompt` 内容最大 `128 KiB`（读取 path 或 inline content 都受限）

## 最短接入路径（TL;DR）

1) 从模板复制：`deepseek_cli/ui_apps/template/basic-plugin` → 放进任一插件目录  
2) 修改 `plugin.json`：只支持 `apps[i].entry.type="module"`（可选增加 `entry.compact` 作为紧凑 UI 入口）  
3) 桌面端打开「应用」页 → 点“刷新” → 进入你的应用  
4) （可选）需要 Node 能力：加 `backend.entry`，前端用 `host.backend.invoke()`  
5) （可选）需要给 Agent 暴露工具/说明：配置 `apps[i].ai`（见 [`CHATOS_UI_APPS_AI_CONTRIBUTIONS.md`](./CHATOS_UI_APPS_AI_CONTRIBUTIONS.md)）

提示：`ai.mcp` / `ai.mcpPrompt` 是否持久化写入 Admin DB，取决于宿主是否启用 `syncAiContributes`；即使不持久化，Agent 运行时也可以按 `apps[i].ai` 声明进行“临时注入”。

## 实现位置（便于对照代码）

- schema（`plugin.json` / `apps[i].ai`）：`deepseek_cli/electron/ui-apps/schemas.js`
- 插件扫描/入口校验/AI 同步：`deepseek_cli/electron/ui-apps/index.js`
- 应用包导入（目录/zip）：`deepseek_cli/electron/ui-apps/plugin-installer.js`
- module 运行时 Host API 注入：`deepseek_cli/apps/ui/src/features/apps/AppsPluginView.jsx`

## 原始文档来源（本次提取/整合）

- `deepseek_cli/doc/app-dev-handbook.md`
- `deepseek_cli/doc/app-integration.md`
- `deepseek_cli/doc/ui-apps-plugins.md`
- `deepseek_cli/doc/ui-apps-dev-guide.md`
- `aide/shared/defaults/ui-apps-expose/README.md`

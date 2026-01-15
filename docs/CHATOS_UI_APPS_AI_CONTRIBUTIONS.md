# ChatOS UI Apps：AI 暴露（MCP / Prompts）协议

本文件描述应用如何对 ChatOS 的 Chat Agent 暴露能力，包括：

- 声明一个专属 MCP Server（让工具随应用交付、随插件安装）
- 声明应用的默认 MCP Prompt（告诉模型如何使用这些工具/这个应用）
- 聚合暴露“已有的”全局 MCP Servers / Prompts（面板型应用常用）
- 内置应用的“开关 + 精细清单”两层机制（清单在 `aide` 维护）

实现对照（以代码为准）：

- schema：`deepseek_cli/electron/ui-apps/schemas.js`
- 扫描与贡献解析：`deepseek_cli/electron/ui-apps/index.js`（`#resolveAi` / `getAiContribution()`；可选 `#syncAiContributes` 持久化到 Admin DB）
- 内置默认清单：`aide/shared/defaults/ui-apps-expose/`

## 1. 两种暴露方式（应用侧选择其一或组合）

### 方式 A：应用自带 MCP Server + MCP Prompt

用于：应用包含专属 tools（数据库查询、系统诊断、内部系统调用等）。

在 `apps[i].ai` 里声明：

- `ai.mcp`：宿主会创建/更新一个 MCP server（`serverName` 固定为 `${pluginId}.${appId}`）
- `ai.mcpPrompt`：宿主会创建/更新对应 system prompt（prompt 名称固定派生）

示例（节选）：

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

### 方式 B：聚合暴露“已有的” MCP servers / Prompts（面板型应用常用）

用于：应用以“工作台/面板”形态聚合展示能力，不提供新的 MCP server，但需要按应用维度暴露已有 MCP servers / Prompts。

在 `apps[i].ai` 里声明：

- `ai.mcpServers: true | false | string[]`
- `ai.prompts: true | false | string[]`

注意：这是“可见/可选范围”的声明；最终是否启用、启用哪些，仍由 Agent 编辑页对该应用的多选结果决定。

## 2. 命名规则（宿主自动派生）

对每个 app：

- MCP `serverName`：`${pluginId}.${appId}`
- Prompt name：
  - 中文：`mcp_<normalize(serverName)>`
  - 英文：`mcp_<normalize(serverName)>__en`

`normalize()`：

- 转小写
- 把非 `[a-z0-9_-]` 的字符替换为 `_`
- 去掉首尾 `_`

## 3. `ai.mcp` 的 url 生成规则（entry → cmd://）

当 `ai.mcp.entry` 存在时，宿主会把它转换为：

- `cmd://<command> <absEntryOrRelEntry> <args...>`
- `command` 默认为 `node`

当 `ai.mcp.url` 存在时，直接使用该 url（远程/HTTP/WS 等）。

### 3.1 `ai.mcp.callMeta`（调用方上下文 / 非工具参数）

当 ChatOS 调用 MCP tools 时，会把 `ai.mcp.callMeta` 注入到 `tools/call` 的 `_meta` 中（不属于工具参数，因此不会暴露给 AI）。

同时，宿主默认注入 `_meta.chatos.uiApp`，包含：

- `pluginId` / `appId`
- `pluginDir` / `dataDir`
- `stateDir` / `sessionRoot` / `projectRoot`

同时，宿主默认注入 `_meta.workdir`（默认等于 `dataDir`；如需指定其它目录，可在 `ai.mcp.callMeta.workdir` 覆盖）。

示例（`plugin.json`）：

```json
{
  "ai": {
    "mcp": {
      "entry": "my-app/mcp-server.mjs",
      "callMeta": { "workdir": "$dataDir" }
    }
  }
}
```

在 MCP server 中读取（SDK handler 的 `extra._meta`）：

```js
const workdir = extra?._meta?.workdir || extra?._meta?.chatos?.uiApp?.dataDir;
```

## 4. Agent UI 如何消费应用暴露（你需要知道的运行机制）

### 4.1 体现在哪里（持久化 vs 运行时注入）

当你把插件放进插件目录并在 UI「应用」页点击“刷新”后：

1) 宿主扫描插件并解析 `plugin.json`
2) 若发现 `apps[i].ai`：
   - 宿主会在 UI Apps 注册表中暴露该应用的 `ai` 声明；
   - **无论是否写入 Admin DB**，Chat Agent 运行时都可通过 `uiApps.getAiContribution()` 读取 `mcp.url` 与 `mcpPrompt` 文本，并按需“临时注入”到本次运行（见第 4.3 节）。
   - （可选）若宿主启用 `syncAiContributes`，则会把 `ai.mcp` / `ai.mcpPrompt` **持久化同步**到 Admin DB（出现在 `MCP Servers` / `Prompts` 列表中，便于管理与复用）。
3) 在 `Chat → Agents` 创建/编辑 agent 时：
   - 先选择应用（按应用维度）
   - 再为每个应用分别勾选 MCP/Prompt，并在多选框中选择要挂载的 servers/prompts

### 4.2 保存结构（简化）

```json
{
  "uiApps": [
    {
      "pluginId": "com.example.tools",
      "appId": "db-client",
      "mcp": true,
      "prompt": true,
      "mcpServerIds": ["<admin.mcpServers.id>", "..."],
      "promptIds": ["<admin.prompts.id>", "..."]
    }
  ]
}
```

### 4.3 运行时关键规则

- 主流程（MAIN）默认只启用 `allowMain=true` 的 MCP server（安全/权限控制）
- 如果希望 prompt 生效，请确保在应用下勾选 Prompt 并选择需要的 prompts（或提供 app 自己的 `ai.mcpPrompt`）

## 5. 内置应用的“开关 + 精细清单”机制

内置应用采用两层设计：

1) 宿主侧（`deepseek_cli` 的 `plugin.json`）只保留粗粒度开关：

```json
{ "ai": { "mcpServers": true, "prompts": true } }
```

2) 精细清单由应用团队在 `aide` 侧维护：

- 路径：`aide/shared/defaults/ui-apps-expose/<pluginId>__<appId>.yaml`（也支持 `.yml/.json`）

示例：

```yaml
mcpServers:
  - project_files
  - task_manager

prompts:
  - default
  - internal_main
  - mcp_project_files
  - mcp_task_manager
```

文件名规范：

- `<pluginId>__<appId>.yaml`（全部小写；不合法字符替换为 `_`）

重要：如果 `plugin.json` 未显式写 `ai.mcpServers/prompts`（或写成 `false`），宿主不会自动启用默认清单，避免“意外暴露”。

## 6. 暴露范围的合并优先级（精确规则）

对 `mcpServers` / `prompts` 分别适用相同规则（从高到低）：

1) `plugin.json` inline 的 `ai.mcpServers/ai.prompts`
2) `ai.config` 文件（插件目录内）的 `mcpServers/prompts`
3) 内置默认清单（`aide/shared/defaults/ui-apps-expose`）

规则要点：

- inline 为 `false`：强制关闭（无视文件与默认清单）
- inline 为 `string[]`：强制使用该列表
- inline 为 `true`：优先用 `ai.config` 的值；若没有，再用默认清单；若仍没有，表示“全部”
- inline 未设置：只允许 `ai.config` 生效（不会自动启用默认清单）

## 7. MCP Server 最小骨架（Node.js / stdio）

MCP server 进程通过 stdio 与宿主通信（不要输出到 stdout，日志写 stderr）：

```js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new McpServer({ name: 'my_server', version: '0.1.0' });

// server.tool('tool_name', schema, handler) ...

const transport = new StdioServerTransport();
await server.connect(transport);
```

提示：

- tools 最终名字通常会变成 `mcp_<serverName>_<toolName>`（由宿主注册/派生）
- `serverName` 为 MCP server 的 `name`（应用方式 A 下由宿主固定派生为 `${pluginId}.${appId}`）

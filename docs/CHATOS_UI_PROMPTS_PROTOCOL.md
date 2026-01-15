# ChatOS UI Prompts（笑脸交互待办）协议

UI Prompts 是 ChatOS 的全局交互队列：任意组件（AI / MCP / UI Apps）都通过向队列写入 `request` 记录来发起一次“需要用户输入/确认”的交互；用户在 UI（右下角笑脸面板）完成填写后，系统写入对应的 `response` 记录来结束该交互。

本协议定义：

- 存储格式：`ui-prompts.jsonl`（JSON Lines 追加日志）
- 交互生命周期：`request` → `response`
- UI 渲染支持的 `prompt.kind` 与字段（`kv` / `choice` / `task_confirm` / `file_change_confirm`）
- UI Apps 的 Host API 调用方式（`host.uiPrompts.*`）

实现对照（以代码为准）：

- UI 渲染：`deepseek_cli/apps/ui/src/features/session/floating-island/FloatingIslandPrompt.jsx`
- 笑脸面板：`deepseek_cli/apps/ui/src/components/UiPromptsSmileHub.jsx`
- Host IPC：`deepseek_cli/electron/main.js`（`uiPrompts:*`）
- 写入/读取日志：`aide/electron/session-api.js`（`requestUiPrompt` / `respondUiPrompt` / `readUiPromptsPayload`）
- MCP `ui_prompter`：`aide/mcp_servers/ui-prompt-server.js`

---

## 1. 存储：`ui-prompts.jsonl`

### 1.1 文件位置

UI Prompts 以 JSONL 形式追加写入到：

- `stateDir/ui-prompts.jsonl`

其中 `stateDir` 为 ChatOS 的状态目录（宿主按 `hostApp` 做隔离；ChatOS 的 `hostApp=chatos`）。

### 1.2 JSONL 记录类型

每一行是一个 JSON 对象（以下简称 entry）。当前 UI Prompts 只消费：

- `entry.type === "ui_prompt"`

并按 `entry.action` 区分：

- `entry.action === "request"`：发起交互
- `entry.action === "response"`：结束交互

### 1.3 Pending 判定（队列语义）

UI 端的“待处理”集合由日志推导：

- 对同一个 `requestId`，存在 `request` 但不存在 `response` 时，该交互处于 pending 状态；
- 当出现 `response` 后，该交互从 pending 中移除；
- 日志是追加写入，系统不删除旧行。

---

## 2. Host API（UI Apps 对接入口）

UI Apps 的 `module` 应用通过 Host API 与 UI Prompts 交互：

- `host.uiPrompts.read(): Promise<{ path: string, entries: any[] }>`
- `host.uiPrompts.onUpdate((payload) => void): () => void`
- `host.uiPrompts.request(payload): Promise<{ ok: true, requestId: string }>`
- `host.uiPrompts.respond(payload): Promise<{ ok: true }>`
- `host.uiPrompts.open()/close()/toggle()`

`host.uiPrompts.request()` 在 `prompt.source` 为空时，会自动写入 `${pluginId}:${appId}`。

### 2.1 `host.uiPrompts.request(payload)`

`payload` 字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `requestId` | `string` | 否 | 为空时宿主生成 |
| `runId` | `string` | 否 | 透传到 entry，用于 UI 标识来源 run |
| `prompt` | `object` | 是 | 交互定义（见第 4-8 节） |

返回：

- `{ ok: true, requestId }`（`requestId` 为最终使用的 ID）

### 2.2 `host.uiPrompts.respond(payload)`

`payload` 字段：

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `requestId` | `string` | 是 | 对应 `request` 的 `requestId` |
| `runId` | `string` | 否 | 透传到 entry |
| `response` | `object` | 是 | 必须包含 `response.status` |

返回：

- `{ ok: true }`

---

## 3. Entry 协议（写入 `ui-prompts.jsonl` 的数据结构）

### 3.1 Request Entry

```json
{
  "ts": "2026-01-11T00:00:00.000Z",
  "type": "ui_prompt",
  "action": "request",
  "requestId": "uuid-or-app-generated-id",
  "runId": "optional-run-id",
  "prompt": { "...": "see below" }
}
```

字段：

- `ts`：ISO 时间字符串
- `type`：固定为 `"ui_prompt"`
- `action`：固定为 `"request"`
- `requestId`：字符串；同一次交互的唯一 ID
- `runId`：可选字符串；用于在 UI 中标识来源 run（显示为 Tag）
- `prompt`：对象；由 `prompt.kind` 决定结构（见第 4 节）

### 3.2 Response Entry

```json
{
  "ts": "2026-01-11T00:00:10.000Z",
  "type": "ui_prompt",
  "action": "response",
  "requestId": "uuid-or-app-generated-id",
  "runId": "optional-run-id",
  "response": { "...": "see below" }
}
```

字段：

- `ts`：ISO 时间字符串
- `type`：固定为 `"ui_prompt"`
- `action`：固定为 `"response"`
- `requestId`：必须与对应 `request` 一致
- `runId`：可选；用于标识来源 run
- `response`：对象；必须包含 `response.status`

---

## 4. Prompt 协议（`prompt.kind`）

### 4.1 通用字段（所有 kind 均可出现）

| 字段 | 类型 | 必填 | 说明 |
|---|---:|---:|---|
| `kind` | `string` | 是 | 取值：`kv` / `choice` / `task_confirm` / `file_change_confirm` |
| `title` | `string` | 否 | UI 标题 |
| `message` | `string` | 否 | UI 描述/说明 |
| `source` | `string` | 否 | 来源标识（UI 显示 Tag） |
| `allowCancel` | `boolean` | 否 | `false` 时 UI 不提供取消入口；其余情况允许取消 |

---

## 5. `kind="kv"`：键值表单（多字段输入）

### 5.1 请求结构

```json
{
  "kind": "kv",
  "title": "需要你补充信息",
  "message": "请填写表单后继续。",
  "source": "com.example.plugin:my-app",
  "allowCancel": true,
  "fields": [
    {
      "key": "name",
      "label": "姓名",
      "description": "用于报告署名",
      "placeholder": "请输入",
      "default": "",
      "required": true,
      "multiline": false,
      "secret": false
    }
  ]
}
```

字段约束：

- `fields`：数组，长度 `1..50`
- `fields[].key`：字符串，非空且在 `fields` 内唯一
- `fields[].label/description/placeholder/default`：可选字符串
- `fields[].required/multiline/secret`：可选布尔

UI 渲染规则：

- `multiline=true` → 多行输入框（TextArea）
- `secret=true` → 密码输入框（Password）
- 否则 → 单行输入框（Input）

### 5.2 响应结构

```json
{ "status": "ok", "values": { "name": "Alice" } }
```

- `status="ok"` 时，`values` 必须为对象，value 类型为 `string`
- `status!="ok"` 时，`values` 字段不参与消费

---

## 6. `kind="choice"`：单选 / 多选

### 6.1 请求结构（单选）

```json
{
  "kind": "choice",
  "title": "需要你做出选择",
  "message": "请选择一项。",
  "source": "com.example.plugin:my-app",
  "allowCancel": true,
  "multiple": false,
  "options": [
    { "value": "alpha", "label": "Alpha", "description": "选项说明" },
    { "value": "beta", "label": "Beta", "description": "" }
  ],
  "default": "alpha",
  "minSelections": 0,
  "maxSelections": 2
}
```

### 6.2 请求结构（多选）

```json
{
  "kind": "choice",
  "title": "需要你做出选择（多选）",
  "message": "请选择 1-2 项。",
  "allowCancel": true,
  "multiple": true,
  "options": [
    { "value": "a", "label": "A" },
    { "value": "b", "label": "B" },
    { "value": "c", "label": "C" }
  ],
  "default": ["a"],
  "minSelections": 1,
  "maxSelections": 2
}
```

字段约束：

- `options`：数组，长度 `1..60`
- `options[].value`：字符串，非空且在 `options` 内唯一
- `options[].label/description`：可选字符串
- `multiple`：布尔，缺省为 `false`
- `default`：
  - `multiple=false` → `string`
  - `multiple=true` → `string[]`
  - 默认值必须来自 `options[].value`
- `minSelections/maxSelections`：
  - `multiple=true` 时生效
  - `minSelections`：整数，范围 `0..options.length`
  - `maxSelections`：整数，范围 `1..options.length`
  - `minSelections <= maxSelections`

### 6.3 响应结构

单选：

```json
{ "status": "ok", "selection": "alpha" }
```

多选：

```json
{ "status": "ok", "selection": ["a", "b"] }
```

`status!="ok"` 时，`selection` 字段不参与消费。

---

## 7. `kind="task_confirm"`：任务创建确认（复杂表单）

该类型用于“任务列表的创建/编辑/排序确认”。UI 会渲染一组可编辑任务卡片，并在提交时返回任务数组。

### 7.1 请求结构

```json
{
  "kind": "task_confirm",
  "title": "任务创建确认",
  "message": "请确认任务列表。",
  "allowCancel": true,
  "source": "main",
  "tasks": [
    {
      "draftId": "uuid",
      "title": "写文档",
      "details": "补齐 UI Prompts 协议",
      "priority": "high",
      "status": "todo",
      "tags": ["docs", "ui-prompts"]
    }
  ],
  "defaultRemark": ""
}
```

字段：

- `tasks`：可选数组（缺省为 `[]`）
- `tasks[].draftId`：字符串；为空时系统会生成
- `tasks[].title/details`：字符串
- `tasks[].priority`：`high | medium | low`（缺省为 `medium`）
- `tasks[].status`：`todo | doing | blocked | done`（缺省为 `todo`）
- `tasks[].tags`：`string[]`
- `defaultRemark`：可选字符串；用于初始化备注输入框

### 7.2 响应结构

```json
{
  "status": "ok",
  "tasks": [
    {
      "draftId": "uuid",
      "title": "写文档",
      "details": "补齐 UI Prompts 协议",
      "priority": "high",
      "status": "todo",
      "tags": ["docs", "ui-prompts"]
    }
  ],
  "remark": "按这个列表创建即可"
}
```

`status="ok"` 时，`tasks` 为数组；`remark` 为可选字符串。  
`status!="ok"` 时，`tasks` 字段不参与消费；`remark` 可出现。

---

## 8. `kind="file_change_confirm"`：文件变更确认（复杂表单）

该类型用于“文件变更/命令执行前确认”。UI 会渲染 diff/命令与路径信息，并在提交时返回 `remark`。

### 8.1 请求结构

```json
{
  "kind": "file_change_confirm",
  "title": "文件变更确认",
  "message": "即将写入文件。",
  "allowCancel": true,
  "source": "filesystem/write_file",
  "path": "src/app.js",
  "command": "node scripts/generate.js",
  "cwd": "C:\\\\project\\\\aide",
  "diff": "--- a/src/app.js\\n+++ b/src/app.js\\n@@ ...",
  "defaultRemark": ""
}
```

字段：

- `path/command/cwd/diff/defaultRemark`：可选字符串

### 8.2 响应结构

```json
{ "status": "ok", "remark": "继续执行" }
```

`remark` 为可选字符串；`status="ok"` 表示确认继续，其它 `status` 表示取消/中止。

---

## 9. 复杂交互的构建方式

UI Prompts 的基本单位是一条 `request` 记录。复杂交互由多条 `request/response` 串联构成：

1) 应用写入第 1 条 `request`（得到 `requestId`）  
2) 应用监听 `host.uiPrompts.onUpdate`，在 entries 中定位同 `requestId` 的 `response`  
3) 应用基于该 `response` 决定下一步，再写入下一条 `request`

在该模型下：

- “多字段表单”使用 `kind="kv"` 的 `fields[]` 承载
- “多选/单选”使用 `kind="choice"` 的 `multiple/options` 承载
- “任务列表确认”使用 `kind="task_confirm"` 承载
- “diff/命令确认”使用 `kind="file_change_confirm"` 承载

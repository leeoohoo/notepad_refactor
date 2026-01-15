# ChatOS UI Apps：插件后端协议（Electron main 进程）

插件后端用于承载需要 Node 能力的逻辑（数据库/SSH/I/O/调用本地二进制等）。后端运行在 Electron main 进程，通过 IPC 由 `module` 前端调用。

实现对照（以代码为准）：

- `deepseek_cli/electron/ui-apps/index.js`（`uiApps:invoke` 与后端加载/缓存）

## 1. 开启后端：`plugin.json`

```json
{
  "backend": { "entry": "backend/index.mjs" }
}
```

约束：

- `backend.entry` 必须位于插件目录内；
- 必须是文件；
- 文件变更后会按 `mtime` 自动 reload（旧实例会尝试调用 `dispose()`）。

## 2. 后端入口：`createUiAppsBackend(ctx)`

后端入口模块必须导出：

```js
export async function createUiAppsBackend(ctx) {
  return {
    methods: {
      async ping(params, ctx2) {
        return { ok: true, echo: params, pluginId: ctx2.pluginId };
      },
    },
    async dispose() {},
  };
}
```

硬约束：

- 必须导出函数 `createUiAppsBackend`
- `createUiAppsBackend()` 返回值必须包含 `{ methods }`

方法调用约定：

- 前端调用：`await host.backend.invoke('ping', params)`
- 实际执行：`methods[method](params, ctx)`
  - 第二个参数 `ctx` 会再次传入（即使你在 `createUiAppsBackend(ctx)` 的闭包里也已拿到一份）

## 3. `ctx`（宿主注入的运行时上下文）

`ctx` 字段（当前实现）：

- `pluginId`：插件 ID
- `pluginDir`：插件安装目录（只读引用；用于读取插件资源）
- `dataDir`：`<stateDir>/ui_apps/data/<pluginId>`（插件可写数据目录；宿主会确保存在）
- `stateDir`：`<home>/.deepseek_cli/<hostApp>`（ChatOS 的 `hostApp=chatos`）
- `sessionRoot`：会话根
- `projectRoot`：宿主工程根（开发态下有用）
- `llm`：可选（共享模型调用接口）
  - `ctx.llm.complete({ input, modelId?, modelName?, systemPrompt?, disableTools? })`
  - 在 ChatOS 宿主实现中，`disableTools` 默认启用（除非显式传 `disableTools:false`）；返回形如 `{ ok:true, model, content }`

规则：

- 持久化只写 `dataDir`，并自行做版本化与迁移。
- 返回值请保持可 JSON 序列化（避免传递函数/循环引用）。
- 插件后端不保存或读取 API Keys；密钥由宿主注入到环境变量；模型调用通过 `ctx.llm.complete()`。

## 4. 错误处理与返回结构

- 后端方法抛错会被宿主捕获并返回 `{ ok:false, message }`；
- 前端侧 `host.backend.invoke()` 会把 `ok:false` 转成异常抛出（便于应用用 `try/catch` 处理）。

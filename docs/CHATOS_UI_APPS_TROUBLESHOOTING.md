# ChatOS UI Apps: Troubleshooting

本文件汇总常见问题与排查思路, 以宿主实现为准.

## 1. host 不可用或 bridge disabled

- 现象: `host` 为空, 或 `host.bridge.enabled === false`.
- 原因: 未在 ChatOS 宿主环境运行, 或 preload bridge 未加载.
- 处理: 在沙箱中调试, 生产环境用 `host.bridge.enabled` 做降级判断.

## 2. module entry 报错或 mount 缺失

- 现象: sandbox 报 "module entry must export mount()".
- 原因: 入口没有导出 `mount`, 或 `plugin.json` 的 `apps[i].entry.path` 指向错误.
- 处理: 确认 `apps[i].entry.type === "module"` 且路径在插件目录内.

## 3. backend.invoke 失败

- 现象: `host.backend.invoke()` 抛错或返回失败.
- 原因: `plugin/backend/index.mjs` 缺失或未导出 `createUiAppsBackend(ctx)`.
- 处理: 补齐后端入口, 在沙箱里重新加载, 并检查路径边界.

## 4. 主题不更新

- 现象: 切换主题后样式不变.
- 原因: 未监听 `host.theme.onChange`, 或样式硬编码颜色.
- 处理: 使用 `host.theme.*` 监听, 样式用 `--ds-*` tokens.

## 5. 资源加载 404

- 现象: 图片/资源在沙箱中 404.
- 原因: 路径不在插件目录内, 或未通过相对路径引用.
- 处理: 用 `new URL('./asset.png', import.meta.url)` 或打包生成产物.

## 6. UI Prompts 不显示

- 现象: `host.uiPrompts.request()` 后无面板.
- 原因: 未调用 `host.uiPrompts.open()`, 或 `prompt.kind` 填写错误.
- 处理: 先调用 `open()` 打开面板, 并按协议填写 `prompt`.

## 7. MCP 不生效

- 现象: MCP tools / prompts 未出现.
- 原因: 未在 `plugin.json` 启用 `ai.mcp` 或未 bundle 依赖.
- 处理: bundle 成单文件, 并检查 `ai.mcp.entry` / `ai.mcpPrompt` 配置.

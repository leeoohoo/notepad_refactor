# ChatOS UI Apps: Theme and Styles Guide

本文件说明 UI Apps 的主题与样式约定, 以宿主实现为准.

## 1. 主题来源

- 宿主通过 `document.documentElement.dataset.theme` 下发主题, 取值 `light` / `dark`.
- 读取: `host.context.get().theme` / `host.theme.get()`.
- 监听: `host.theme.onChange(listener)`.

## 2. 沙箱测试

- DevKit sandbox 右上角提供 Theme 切换 (light/dark/system).
- `system` 模式跟随 `prefers-color-scheme`.
- sandbox 同时写入 `document.documentElement.dataset.theme` 和 `dataset.themeMode`.
- Inspect 面板可查看 `host.context` 与 `--ds-*` tokens, tokens 列表会尝试从 `common/aide-ui/components/GlobalStyles.jsx` 自动读取.

## 3. 常用 CSS Tokens (subset)

以下为宿主常用 token 的子集, 具体以实现为准. 推荐在非 ChatOS 环境下保留 fallback.

基础:
- `--ds-accent`
- `--ds-accent-2`
- `--ds-accent-app`

容器与面板:
- `--ds-page-bg`
- `--ds-header-bg`
- `--ds-header-border`
- `--ds-panel-bg`
- `--ds-panel-border`
- `--ds-panel-shadow`
- `--ds-subtle-bg`
- `--ds-selected-bg`
- `--ds-floating-bg`
- `--ds-floating-border`
- `--ds-floating-shadow`
- `--ds-focus-ring`

导航:
- `--ds-nav-bg`
- `--ds-nav-border`
- `--ds-nav-shadow`
- `--ds-nav-hover-bg`

状态:
- `--ds-change-bg-error`
- `--ds-change-bg-warning`
- `--ds-change-bg-success`

代码:
- `--ds-code-bg`
- `--ds-code-border`
- `--ds-code-inline-bg`
- `--ds-code-inline-border`
- `--ds-code-line-number`
- `--ds-blockquote-border`
- `--ds-blockquote-text`
- `--ds-code-text`
- `--ds-code-comment`
- `--ds-code-keyword`
- `--ds-code-string`
- `--ds-code-number`
- `--ds-code-built-in`
- `--ds-code-attr`
- `--ds-code-title`
- `--ds-code-meta`

Token 来源: `common/aide-ui/components/GlobalStyles.jsx`.

## 4. 推荐写法

CSS:

```css
.card {
  background: var(--ds-panel-bg);
  border: 1px solid var(--ds-panel-border);
  box-shadow: var(--ds-panel-shadow, none);
}
```

JS inline style:

```js
el.style.border = '1px solid var(--ds-panel-border, rgba(0,0,0,0.12))';
el.style.background = 'var(--ds-subtle-bg, rgba(0,0,0,0.04))';
```

## 5. 注意事项

- 避免硬编码颜色, 用 token 统一主题适配.
- 仅在必要时使用 `prefers-color-scheme`, 优先跟随宿主 theme.
- 避免污染全局 `html/body` 样式, 样式尽量限定在容器内.

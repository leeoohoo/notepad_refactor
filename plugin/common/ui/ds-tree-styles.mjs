export const DS_TREE_STYLES = `
  .ds-tree {
    --ds-tree-row-height: 28px;
    --ds-tree-row-radius: 10px;
    --ds-tree-indent: 18px;
    --ds-tree-padding-x: 10px;
    --ds-tree-gap: 2px;
    --ds-tree-hover-bg: var(--ds-nav-hover-bg, rgba(15, 23, 42, 0.06));
    --ds-tree-selected-bg: var(--ds-selected-bg, rgba(0, 212, 255, 0.14));
    --ds-tree-selected-shadow: 0 0 0 2px var(--ds-focus-ring, rgba(0, 212, 255, 0.32));
    --ds-tree-toggle-size: 18px;

    display: flex;
    flex-direction: column;
    gap: var(--ds-tree-gap);
    min-width: 0;
  }

  .ds-tree-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    height: var(--ds-tree-row-height);
    padding-right: var(--ds-tree-padding-x);
    padding-left: calc(var(--ds-tree-padding-x) + (var(--ds-tree-depth, 0) * var(--ds-tree-indent)));
    border-radius: var(--ds-tree-row-radius);
    box-sizing: border-box;
    border: 1px solid transparent;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
  }

  .ds-tree-row:hover {
    background: var(--ds-tree-hover-bg);
    border-color: var(--ds-panel-border);
  }

  .ds-tree-row[data-active='1'] {
    background: var(--ds-tree-selected-bg);
    box-shadow: var(--ds-tree-selected-shadow);
    border-color: var(--ds-focus-ring, rgba(0, 212, 255, 0.32));
  }

  .ds-tree-row:focus-visible {
    outline: 2px solid var(--ds-focus-ring, rgba(0, 212, 255, 0.32));
    outline-offset: 2px;
  }

  .ds-tree-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    display: inline-block;
    background: currentColor;
    opacity: 0.78;
    -webkit-mask-repeat: no-repeat;
    mask-repeat: no-repeat;
    -webkit-mask-position: center;
    mask-position: center;
    -webkit-mask-size: contain;
    mask-size: contain;
  }

  .ds-tree-icon-folder {
    -webkit-mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEwIDRoLTRhMiAyIDAgMCAwLTIgMnYxMmEyIDIgMCAwIDAgMiAyaDE0YTIgMiAwIDAgMCAyLTJWOEExIDIgMCAwIDAgMjAgNmgtOGwtMi0yeiIvPjwvc3ZnPg==');
    mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEwIDRoLTRhMiAyIDAgMCAwLTIgMnYxMmEyIDIgMCAwIDAgMiAyaDE0YTIgMiAwIDAgMCAyLTJWOEExIDIgMCAwIDAgMjAgNmgtOGwtMi0yeiIvPjwvc3ZnPg==');
  }

  .ds-tree-icon-home {
    color: var(--ds-accent, #00d4ff);
    -webkit-mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDMuNWw4LjUgNy4xVjIwYTIgMiAwIDAgMS0yIDJoLTUuNXYtNi41aC0yVjIyaC01LjVhMiAyIDAgMCAxLTItMnYtOS40TDEyIDMuNXoiLz48L3N2Zz4=');
    mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDMuNWw4LjUgNy4xVjIwYTIgMiAwIDAgMS0yIDJoLTUuNXYtNi41aC0yVjIyaC01LjVhMiAyIDAgMCAxLTItMnYtOS40TDEyIDMuNXoiLz48L3N2Zz4=');
  }

  .ds-tree-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ds-tree-row[data-active='1'] .ds-tree-label {
    font-weight: 650;
  }

  .ds-tree-toggle {
    width: var(--ds-tree-toggle-size);
    height: var(--ds-tree-toggle-size);
    flex: 0 0 var(--ds-tree-toggle-size);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 8px;
    padding: 0;
    cursor: pointer;
    color: inherit;
    opacity: 0.7;
  }

  .ds-tree-toggle:hover {
    background: var(--ds-tree-hover-bg);
    border-color: var(--ds-panel-border);
    opacity: 1;
  }

  .ds-tree-toggle:focus-visible {
    outline: 2px solid var(--ds-focus-ring, rgba(0, 212, 255, 0.32));
    outline-offset: 2px;
  }

  .ds-tree-toggle .ds-tree-icon {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
  }

  .ds-tree-toggle-placeholder {
    width: var(--ds-tree-toggle-size);
    height: var(--ds-tree-toggle-size);
    flex: 0 0 var(--ds-tree-toggle-size);
  }

  .ds-tree-icon-chevron {
    transition: transform 140ms ease;
    transform-origin: center;
    -webkit-mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTkuMjkgNi43MWExIDEgMCAwIDEgMS40MiAwTDE1LjI5IDExLjI5YTEgMSAwIDAgMSAwIDEuNDJsLTQuNTggNC41OGExIDEgMCAwIDEtMS40Mi0xLjQyTDEzLjE3IDEyIDkuMjkgOC4xMmExIDEgMCAwIDEgMC0xLjQxeiIvPjwvc3ZnPg==');
    mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTkuMjkgNi43MWExIDEgMCAwIDEgMS40MiAwTDE1LjI5IDExLjI5YTEgMSAwIDAgMSAwIDEuNDJsLTQuNTggNC41OGExIDEgMCAwIDEtMS40Mi0xLjQyTDEzLjE3IDEyIDkuMjkgOC4xMmExIDEgMCAwIDEgMC0xLjQxeiIvPjwvc3ZnPg==');
  }

  .ds-tree-row[data-expanded='1'] .ds-tree-icon-chevron {
    transform: rotate(90deg);
  }

  .ds-tree-icon-new-folder {
    -webkit-mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEwIDRINmEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlY4YTIgMiAwIDAgMC0yLTJoLThsLTItMnoiLz48cGF0aCBkPSJNMTEgMTFoMnYzaDN2MmgtM3YzaC0ydi0zSDh2LTJoM3oiLz48L3N2Zz4=');
    mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEwIDRINmEyIDIgMCAwIDAtMiAydjEyYTIgMiAwIDAgMCAyIDJoMTRhMiAyIDAgMCAwIDItMlY4YTIgMiAwIDAgMC0yLTJoLThsLTItMnoiLz48cGF0aCBkPSJNMTEgMTFoMnYzaDN2MmgtM3YzaC0ydi0zSDh2LTJoM3oiLz48L3N2Zz4=');
  }

  .ds-tree-icon-new-note {
    -webkit-mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTYgNGgxMmEyIDIgMCAwIDEgMiAydjE0YTIgMiAwIDAgMS0yIDJINmEyIDIgMCAwIDEtMi0yVjZhMiAyIDAgMCAxIDItMnoiLz48cGF0aCBkPSJNMTEgMTFoMnYzaDN2MmgtM3YzaC0ydi0zSDh2LTJoM3oiLz48L3N2Zz4=');
    mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTYgNGgxMmEyIDIgMCAwIDEgMiAydjE0YTIgMiAwIDAgMS0yIDJINmEyIDIgMCAwIDEtMi0yVjZhMiAyIDAgMCAxIDItMnoiLz48cGF0aCBkPSJNMTEgMTFoMnYzaDN2MmgtM3YzaC0ydi0zSDh2LTJoM3oiLz48L3N2Zz4=');
  }

  .ds-tree-icon-note {
    color: var(--ds-accent-2, #7c3aed);
    -webkit-mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTYgMmg5bDUgNXYxNWEyIDIgMCAwIDEtMiAySDZhMiAyIDAgMCAxLTItMlY0YTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTE1IDJ2NWg1eiIvPjxwYXRoIGQ9Ik04IDExaDh2Mkg4eiIvPjxwYXRoIGQ9Ik04IDE1aDh2Mkg4eiIvPjxwYXRoIGQ9Ik04IDE5aDZ2Mkg4eiIvPjwvc3ZnPg==');
    mask-image: url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTYgMmg5bDUgNXYxNWEyIDIgMCAwIDEtMiAySDZhMiAyIDAgMCAxLTItMlY0YTIgMiAwIDAgMSAyLTJ6Ii8+PHBhdGggZD0iTTE1IDJ2NWg1eiIvPjxwYXRoIGQ9Ik04IDExaDh2Mkg4eiIvPjxwYXRoIGQ9Ik04IDE1aDh2Mkg4eiIvPjxwYXRoIGQ9Ik04IDE5aDZ2Mkg4eiIvPjwvc3ZnPg==');
  }
`;

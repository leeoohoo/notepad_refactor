import { DS_TREE_STYLES } from './ds-tree.mjs';

export const NOTEPAD_MANAGER_STYLES = `
${DS_TREE_STYLES}
    .np-root {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 12px;
      box-sizing: border-box;
    }
    .np-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .np-title {
      font-weight: 750;
      letter-spacing: 0.2px;
    }
    .np-meta {
      font-size: 12px;
      opacity: 0.72;
    }
    .np-pill {
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--ds-panel-border);
      background: var(--ds-subtle-bg);
      white-space: nowrap;
      user-select: none;
    }
    .np-pill[data-tone='ok'] { box-shadow: 0 0 0 3px rgba(46, 160, 67, 0.12); }
    .np-pill[data-tone='bad'] { box-shadow: 0 0 0 3px rgba(248, 81, 73, 0.12); }
    .np-btn {
      border: 1px solid var(--ds-panel-border);
      background: transparent;
      border-radius: 10px;
      padding: 6px 8px;
      cursor: pointer;
      font-weight: 600;
      font-size: 12px;
      line-height: 1.2;
      white-space: nowrap;
    }
    .np-btn:hover { background: var(--ds-subtle-bg); }
    .np-btn:focus-visible {
      outline: 2px solid var(--ds-focus-ring, rgba(0, 212, 255, 0.32));
      outline-offset: 1px;
    }
    .np-btn:disabled,
    .np-btn[data-disabled='1'] {
      opacity: 0.55;
      cursor: not-allowed;
      box-shadow: none !important;
    }
    .np-input, .np-select, .np-textarea {
      border: 1px solid var(--ds-panel-border);
      background: var(--ds-subtle-bg);
      color: inherit;
      border-radius: 10px;
      padding: 7px 9px;
      outline: none;
      box-sizing: border-box;
    }
    .np-input { width: 100%; }
    .np-select { width: 100%; }
    .np-textarea {
      width: 100%;
      height: 100%;
      resize: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 13px;
      line-height: 1.45;
      background: var(--ds-code-bg);
      border-color: var(--ds-code-border);
    }
    .np-grid {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 300px 1fr;
      gap: 10px;
    }
    .np-root[data-layout='stacked'] .np-grid {
      grid-template-columns: 1fr;
      grid-template-rows: minmax(0, auto) minmax(0, 1fr);
    }
    .np-root[data-surface='compact'][data-layout='split'] .np-grid {
      grid-template-columns: minmax(200px, 36%) minmax(0, 1fr);
    }
    .np-card {
      border: 1px solid var(--ds-panel-border);
      background: var(--ds-panel-bg);
      border-radius: 12px;
      overflow: hidden;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    .np-card-header {
      padding: 8px 10px;
      border-bottom: 1px solid var(--ds-panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      font-weight: 650;
    }
    .np-card-body {
      padding: 10px;
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .np-section-title {
      font-size: 12px;
      font-weight: 750;
      opacity: 0.85;
      margin-bottom: 6px;
    }
    .np-section-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .np-section-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .np-btn-icon {
      width: 30px;
      height: 30px;
      padding: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .np-btn-icon .ds-tree-icon {
      opacity: 0.86;
    }
    .np-create-hint {
      margin-top: 6px;
    }
    .np-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .np-item {
      border: 1px solid var(--ds-panel-border);
      background: var(--ds-subtle-bg);
      border-radius: 12px;
      padding: 8px 10px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .np-item:hover { box-shadow: 0 0 0 3px var(--ds-focus-ring); }
    .np-item[data-active='1'] {
      border-color: rgba(46, 160, 67, 0.55);
      box-shadow: 0 0 0 3px rgba(46, 160, 67, 0.18);
    }
    .np-item-title { font-weight: 700; }
    .np-item-meta { font-size: 12px; opacity: 0.72; }
    .np-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
    .np-chip {
      font-size: 12px;
      padding: 6px 10px;
      border-radius: 999px;
      border: 1px solid var(--ds-panel-border);
      background: var(--ds-subtle-bg);
      cursor: pointer;
      user-select: none;
    }
    .np-chip:hover { box-shadow: 0 0 0 3px var(--ds-focus-ring); }
    .np-chip[data-active='1'] {
      border-color: rgba(46, 160, 67, 0.55);
      box-shadow: 0 0 0 3px rgba(46, 160, 67, 0.18);
    }
    .np-row {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .np-row-compact {
      flex-wrap: nowrap;
    }
    .np-row-compact > .np-input {
      width: auto;
      flex: 1 1 auto;
      min-width: 0;
    }
    .np-editor-top {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 8px;
    }
    .np-editor-top-row {
      display: grid;
      grid-template-columns: 1fr 220px;
      gap: 8px;
      align-items: center;
    }
    .np-root[data-surface='compact'] .np-editor-top,
    .np-root[data-surface='compact'] .np-editor-top-row {
      grid-template-columns: 1fr;
    }
    .np-editor-split {
      flex: 1;
      min-height: 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .np-root[data-editor-mode='preview'] .np-textarea {
      display: none;
    }
    .np-root[data-editor-mode='preview'] .np-editor-split {
      grid-template-columns: 1fr;
    }
    .np-preview {
      border: 1px solid var(--ds-code-border);
      background: var(--ds-code-bg);
      border-radius: 10px;
      padding: 10px;
      overflow: auto;
      min-height: 0;
      font-size: 13px;
      line-height: 1.6;
    }
    .np-preview h1, .np-preview h2, .np-preview h3, .np-preview h4, .np-preview h5, .np-preview h6 {
      margin: 12px 0 8px;
      font-weight: 750;
    }
    .np-preview p { margin: 0 0 10px; }
    .np-preview code {
      padding: 2px 6px;
      border-radius: 6px;
      border: 1px solid var(--ds-code-border);
      background: rgba(110, 118, 129, 0.18);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      font-size: 12px;
    }
    .np-preview pre {
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--ds-code-border);
      overflow: auto;
      background: rgba(110, 118, 129, 0.18);
    }
    .np-preview pre code { border: none; padding: 0; background: transparent; }
    .np-preview blockquote {
      margin: 0 0 10px;
      padding: 8px 10px;
      border-left: 3px solid var(--ds-panel-border);
      background: rgba(110, 118, 129, 0.14);
      border-radius: 10px;
    }
    .np-preview ul, .np-preview ol { margin: 0 0 10px 22px; }
    .np-preview img { max-width: 100%; border-radius: 10px; border: 1px solid var(--ds-panel-border); }
    .np-menu-overlay {
      position: fixed;
      inset: 0;
      z-index: 999;
    }
    .np-menu {
      position: absolute;
      min-width: 220px;
      background: var(--ds-panel-bg);
      border: 1px solid var(--ds-panel-border);
      border-radius: 12px;
      padding: 6px;
      box-shadow: 0 18px 48px rgba(0,0,0,0.22);
    }
    .np-menu-item {
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      text-align: left;
      padding: 8px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 600;
    }
    .np-menu-item:hover { background: var(--ds-subtle-bg); }
    .np-menu-item:disabled { opacity: 0.5; cursor: not-allowed; }
    .np-menu-item[data-danger='1'] { color: #f85149; }
    :root[data-theme='dark'] .np-menu-item[data-danger='1'] { color: #ff7b72; }
    .np-modal-overlay {
      position: fixed;
      inset: 0;
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 18px;
      background: rgba(0,0,0,0.35);
    }
    .np-modal {
      width: min(520px, 100%);
      border: 1px solid var(--ds-panel-border);
      background: var(--ds-panel-bg);
      border-radius: 14px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      box-shadow: 0 18px 48px rgba(0,0,0,0.25);
    }
    .np-modal-header {
      padding: 12px 14px;
      border-bottom: 1px solid var(--ds-panel-border);
      font-weight: 750;
      font-size: 14px;
    }
    .np-modal-body {
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .np-modal-desc {
      font-size: 13px;
      opacity: 0.85;
      white-space: pre-wrap;
    }
    .np-modal-field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .np-modal-label {
      font-size: 12px;
      font-weight: 700;
      opacity: 0.85;
    }
    .np-modal-error {
      font-size: 12px;
      color: #f85149;
    }
    :root[data-theme='dark'] .np-modal-error { color: #ff7b72; }
    .np-modal-actions {
      padding: 12px 14px;
      border-top: 1px solid var(--ds-panel-border);
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 8px;
    }
    .np-btn[data-variant='danger'] { border-color: rgba(248, 81, 73, 0.5); }
    .np-btn[data-variant='danger']:hover { box-shadow: 0 0 0 3px rgba(248, 81, 73, 0.24); }
`;


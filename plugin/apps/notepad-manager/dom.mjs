export function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isElement(node) {
  return node && typeof node === 'object' && typeof node.appendChild === 'function';
}

export function setButtonEnabled(btn, enabled) {
  if (!btn) return;
  btn.disabled = !enabled;
  btn.dataset.disabled = enabled ? '0' : '1';
}


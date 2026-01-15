function noop() {}

function safeSetStatus(setStatus, text) {
  if (typeof setStatus !== 'function') return;
  try {
    setStatus(String(text || ''), 'bad');
  } catch {
    // ignore
  }
}

export function createNotepadLayerManager({ getDisposed, setStatus } = {}) {
  const isDisposed = typeof getDisposed === 'function' ? getDisposed : () => false;

  let activeLayer = null;

  const closeActiveLayer = () => {
    const layer = activeLayer;
    activeLayer = null;
    if (!layer) return;
    try {
      layer.dispose?.();
    } catch {
      // ignore
    }
  };

  const showMenu = (x, y, items = []) => {
    if (isDisposed()) return;
    closeActiveLayer();

    const overlay = document.createElement('div');
    overlay.className = 'np-menu-overlay';

    const menu = document.createElement('div');
    menu.className = 'np-menu';

    const close = () => {
      try {
        document.removeEventListener('keydown', onKeyDown, true);
      } catch {
        // ignore
      }
      try {
        overlay.remove();
      } catch {
        // ignore
      }
      if (activeLayer?.overlay === overlay) activeLayer = null;
    };

    const onKeyDown = (ev) => {
      if (ev?.key !== 'Escape') return;
      try {
        ev.preventDefault();
      } catch {
        // ignore
      }
      close();
    };

    overlay.addEventListener('mousedown', (ev) => {
      if (ev?.target !== overlay) return;
      close();
    });
    overlay.addEventListener('contextmenu', (ev) => {
      try {
        ev.preventDefault();
      } catch {
        // ignore
      }
      close();
    });

    (Array.isArray(items) ? items : []).forEach((item) => {
      const label = typeof item?.label === 'string' ? item.label : '';
      if (!label) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'np-menu-item';
      btn.textContent = label;
      btn.disabled = item?.disabled === true;
      btn.dataset.danger = item?.danger === true ? '1' : '0';
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        close();
        try {
          await item?.onClick?.();
        } catch (err) {
          safeSetStatus(setStatus, `Notes: ${err?.message || String(err)}`);
        }
      });
      menu.appendChild(btn);
    });

    overlay.appendChild(menu);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKeyDown, true);

    menu.style.left = `${Math.max(0, Math.floor(x))}px`;
    menu.style.top = `${Math.max(0, Math.floor(y))}px`;
    try {
      const rect = menu.getBoundingClientRect();
      const margin = 8;
      let left = Math.floor(x);
      let top = Math.floor(y);
      if (left + rect.width + margin > window.innerWidth) left = Math.max(margin, window.innerWidth - rect.width - margin);
      if (top + rect.height + margin > window.innerHeight) top = Math.max(margin, window.innerHeight - rect.height - margin);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    } catch {
      // ignore
    }

    activeLayer = { overlay, dispose: close };
  };

  const showDialog = ({
    title,
    description = '',
    fields = [],
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
  } = {}) =>
    new Promise((resolve) => {
      if (isDisposed()) return resolve(null);
      closeActiveLayer();

      const overlay = document.createElement('div');
      overlay.className = 'np-modal-overlay';
      const modal = document.createElement('div');
      modal.className = 'np-modal';

      const header = document.createElement('div');
      header.className = 'np-modal-header';
      header.textContent = typeof title === 'string' && title.trim() ? title.trim() : '提示';

      const body = document.createElement('div');
      body.className = 'np-modal-body';

      const desc = document.createElement('div');
      desc.className = 'np-modal-desc';
      desc.textContent = typeof description === 'string' ? description : '';
      if (desc.textContent.trim()) {
        body.appendChild(desc);
      }

      const errorEl = document.createElement('div');
      errorEl.className = 'np-modal-error';
      errorEl.textContent = '';

      const inputs = [];
      (Array.isArray(fields) ? fields : []).forEach((field) => {
        if (!field || typeof field !== 'object') return;
        const name = typeof field.name === 'string' ? field.name.trim() : '';
        if (!name) return;
        const row = document.createElement('div');
        row.className = 'np-modal-field';

        const label = document.createElement('div');
        label.className = 'np-modal-label';
        label.textContent = typeof field.label === 'string' ? field.label : name;
        row.appendChild(label);

        let control = null;
        const kind = field.kind === 'select' ? 'select' : 'text';
        if (kind === 'select') {
          const select = document.createElement('select');
          select.className = 'np-select';
          const options = Array.isArray(field.options) ? field.options : [];
          options.forEach((opt) => {
            const value = typeof opt?.value === 'string' ? opt.value : '';
            const labelText = typeof opt?.label === 'string' ? opt.label : value;
            const option = document.createElement('option');
            option.value = value;
            option.textContent = labelText || value || '（空）';
            select.appendChild(option);
          });
          select.value = typeof field.value === 'string' ? field.value : '';
          control = select;
        } else {
          const input = document.createElement('input');
          input.className = 'np-input';
          input.type = 'text';
          input.placeholder = typeof field.placeholder === 'string' ? field.placeholder : '';
          input.value = typeof field.value === 'string' ? field.value : '';
          control = input;
        }

        row.appendChild(control);
        body.appendChild(row);
        inputs.push({
          name,
          required: field.required === true,
          control,
          label: typeof field.label === 'string' ? field.label : name,
        });
      });

      if (inputs.length > 0) {
        body.appendChild(errorEl);
      }

      const actions = document.createElement('div');
      actions.className = 'np-modal-actions';

      const btnCancel = document.createElement('button');
      btnCancel.type = 'button';
      btnCancel.className = 'np-btn';
      btnCancel.textContent = cancelText || '取消';

      const btnOk = document.createElement('button');
      btnOk.type = 'button';
      btnOk.className = 'np-btn';
      btnOk.textContent = confirmText || '确定';
      btnOk.dataset.variant = danger ? 'danger' : '';

      const cleanup = () => {
        try {
          document.removeEventListener('keydown', onKeyDown, true);
        } catch {
          // ignore
        }
        try {
          overlay.remove();
        } catch {
          // ignore
        }
        if (activeLayer?.overlay === overlay) activeLayer = null;
      };

      const close = (result) => {
        cleanup();
        resolve(result);
      };

      const validateAndClose = () => {
        const values = {};
        for (const it of inputs) {
          const raw = it?.control?.value;
          const value = typeof raw === 'string' ? raw.trim() : String(raw ?? '').trim();
          if (it.required && !value) {
            errorEl.textContent = `请填写：${it.label}`;
            try {
              it.control?.focus?.();
            } catch {
              // ignore
            }
            return;
          }
          values[it.name] = value;
        }
        close(values);
      };

      const onKeyDown = (ev) => {
        if (ev?.key === 'Escape') {
          try {
            ev.preventDefault();
          } catch {
            // ignore
          }
          close(null);
          return;
        }
        if (ev?.key === 'Enter') {
          const active = document.activeElement;
          const isTextArea = active && active.tagName === 'TEXTAREA';
          if (isTextArea) return;
          try {
            ev.preventDefault();
          } catch {
            // ignore
          }
          validateAndClose();
        }
      };

      overlay.addEventListener('mousedown', (ev) => {
        if (ev?.target !== overlay) return;
        close(null);
      });

      btnOk.addEventListener('click', () => validateAndClose());
      btnCancel.addEventListener('click', () => close(null));

      actions.appendChild(btnCancel);
      actions.appendChild(btnOk);
      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(actions);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);
      document.addEventListener('keydown', onKeyDown, true);

      activeLayer = { overlay, dispose: () => close(null) };

      const first = inputs[0]?.control;
      if (first) {
        setTimeout(() => {
          try {
            first.focus();
          } catch {
            // ignore
          }
        }, 0);
      } else {
        setTimeout(() => {
          try {
            btnOk.focus();
          } catch {
            // ignore
          }
        }, 0);
      }
    });

  const confirmDialog = async (message, options = {}) => {
    const res = await showDialog({
      title: options?.title || '确认',
      description: typeof message === 'string' ? message : '',
      fields: [],
      confirmText: options?.confirmText || '确定',
      cancelText: options?.cancelText || '取消',
      danger: options?.danger === true,
    });
    return Boolean(res);
  };

  return {
    closeActiveLayer,
    showMenu,
    showDialog,
    confirmDialog,
  };
}


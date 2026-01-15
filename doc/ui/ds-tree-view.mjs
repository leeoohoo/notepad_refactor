function normalizeSeparator(separator) {
  return typeof separator === 'string' && separator ? separator : '/';
}

function normalizePath(rawPath, separator) {
  const sep = normalizeSeparator(separator);
  const value = typeof rawPath === 'string' ? rawPath.trim() : '';
  if (!value) return '';
  const normalized = sep === '/' ? value.replace(/\\/g, '/') : value;
  const parts = normalized
    .split(sep)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.join(sep);
}

function buildPathTree(paths, separator) {
  const sep = normalizeSeparator(separator);
  const nodes = new Map();
  const rootKey = '';
  nodes.set(rootKey, { key: rootKey, name: '', parentKey: null, children: new Set() });

  (Array.isArray(paths) ? paths : []).forEach((raw) => {
    const path = normalizePath(raw, sep);
    if (!path) return;
    const parts = path.split(sep).filter(Boolean);
    let parentKey = rootKey;
    for (const name of parts) {
      const key = parentKey ? `${parentKey}${sep}${name}` : name;
      if (!nodes.has(key)) {
        nodes.set(key, { key, name, parentKey, children: new Set() });
      }
      const parent = nodes.get(parentKey);
      if (parent) parent.children.add(key);
      parentKey = key;
    }
  });

  return { nodes, rootKey, separator: sep };
}

function getAncestorKeys(key, separator) {
  const sep = normalizeSeparator(separator);
  const path = normalizePath(key, sep);
  if (!path) return [''];
  const parts = path.split(sep).filter(Boolean);
  const ancestors = [''];
  let acc = '';
  for (let index = 0; index < parts.length - 1; index += 1) {
    acc = acc ? `${acc}${sep}${parts[index]}` : parts[index];
    ancestors.push(acc);
  }
  return ancestors;
}

function compareNodesByName(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

export function createDsPathTreeView({
  container,
  separator = '/',
  includeRoot = true,
  initialExpandedKeys = [''],
  getLabel,
  getTitle,
  getIconClass,
  getSortMeta,
  onSelect,
  onContextMenu,
} = {}) {
  if (!container || typeof container.appendChild !== 'function') {
    throw new Error('createDsPathTreeView: container is required');
  }

  const sep = normalizeSeparator(separator);
  const resolveLabel = typeof getLabel === 'function' ? getLabel : (key) => (key ? key.split(sep).slice(-1)[0] : key);
  const resolveTitle = typeof getTitle === 'function' ? getTitle : (key) => key;
  const resolveIconClass = typeof getIconClass === 'function' ? getIconClass : () => '';
  const resolveSortMeta = typeof getSortMeta === 'function' ? getSortMeta : null;
  const handleSelect = typeof onSelect === 'function' ? onSelect : null;
  const handleContextMenu = typeof onContextMenu === 'function' ? onContextMenu : null;

  const runHandler = (handler, ...args) => {
    if (typeof handler !== 'function') return;
    try {
      const out = handler(...args);
      if (out && typeof out.then === 'function') {
        out.catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  let currentPaths = [];
  let currentSelectedKey = '';
  let expandedKeys = new Set(
    (Array.isArray(initialExpandedKeys) ? initialExpandedKeys : []).map((key) => normalizePath(key, sep))
  );
  let lastNodes = null;

  const setExpandedKeys = (nextKeys) => {
    expandedKeys = new Set((Array.isArray(nextKeys) ? nextKeys : []).map((key) => normalizePath(key, sep)));
  };

  const toggleExpanded = (key) => {
    const normalizedKey = normalizePath(key, sep);
    const nodes = lastNodes;
    const node = nodes?.get(normalizedKey);
    if (!node || node.children.size === 0) return;
    if (expandedKeys.has(normalizedKey)) expandedKeys.delete(normalizedKey);
    else expandedKeys.add(normalizedKey);
    render();
  };

  const expandAll = () => {
    const { nodes } = buildPathTree(currentPaths, sep);
    const next = new Set(['']);
    nodes.forEach((node) => {
      if (node?.children?.size) next.add(node.key);
    });
    expandedKeys = next;
    render();
  };

  const collapseAll = () => {
    expandedKeys = new Set(['']);
    render();
  };

  const render = ({ paths, selectedKey } = {}) => {
    if (paths !== undefined) currentPaths = Array.isArray(paths) ? [...paths] : [];
    if (selectedKey !== undefined) currentSelectedKey = normalizePath(selectedKey, sep);

    const { nodes, rootKey } = buildPathTree(currentPaths, sep);
    lastNodes = nodes;

    const knownKeys = new Set(nodes.keys());
    expandedKeys = new Set(Array.from(expandedKeys).filter((key) => knownKeys.has(key)));

    const autoExpandKeys = getAncestorKeys(currentSelectedKey, sep);
    autoExpandKeys.forEach((key) => {
      if (knownKeys.has(key)) expandedKeys.add(key);
    });

    const readSortMeta = (key) => {
      const node = nodes.get(key);
      if (resolveSortMeta) {
        const meta = resolveSortMeta(key, node);
        if (meta && typeof meta === 'object') {
          const groupRaw = meta.group;
          const group = Number.isFinite(groupRaw) ? groupRaw : 0;
          const label = typeof meta.label === 'string' ? meta.label : String(meta.label ?? '');
          return { group, label };
        }
        if (typeof meta === 'string') {
          return { group: 0, label: meta };
        }
      }
      return { group: 0, label: node?.name || key };
    };

    const visible = [];
    const walk = (key, depth) => {
      const node = nodes.get(key);
      if (!node) return;
      const childrenKeys = Array.from(node.children);
      childrenKeys.sort((aKey, bKey) => {
        const a = readSortMeta(aKey);
        const b = readSortMeta(bKey);
        if (a.group !== b.group) return a.group - b.group;
        const cmp = compareNodesByName(a.label, b.label);
        if (cmp) return cmp;
        return compareNodesByName(aKey, bKey);
      });
      const hasChildren = childrenKeys.length > 0;
      const isExpanded = hasChildren ? expandedKeys.has(key) : false;
      visible.push({ key, depth, hasChildren, isExpanded });
      if (!hasChildren || !isExpanded) return;
      childrenKeys.forEach((childKey) => walk(childKey, depth + 1));
    };

    if (includeRoot) {
      if (!expandedKeys.has(rootKey)) expandedKeys.add(rootKey);
      walk(rootKey, 0);
    } else {
      walk(rootKey, -1);
      visible.shift();
      visible.forEach((item) => {
        item.depth = Math.max(0, item.depth - 1);
      });
    }

    const prevScrollTop = typeof container.scrollTop === 'number' ? container.scrollTop : 0;
    try {
      container.textContent = '';
    } catch {
      // ignore
    }

    const fragment = document.createDocumentFragment();
    visible.forEach(({ key, depth, hasChildren, isExpanded }) => {
      const row = document.createElement('div');
      row.className = 'ds-tree-row';
      row.tabIndex = 0;
      row.dataset.active = key === currentSelectedKey ? '1' : '0';
      row.dataset.expanded = isExpanded ? '1' : '0';
      row.style.setProperty('--ds-tree-depth', String(Math.max(0, depth)));
      row.title = resolveTitle(key) || '';

      if (hasChildren) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'ds-tree-toggle';
        toggle.title = isExpanded ? '收起' : '展开';
        toggle.addEventListener('click', (ev) => {
          try {
            ev.preventDefault();
            ev.stopPropagation();
          } catch {
            // ignore
          }
          toggleExpanded(key);
        });
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'ds-tree-icon ds-tree-icon-chevron';
        toggle.appendChild(toggleIcon);
        row.appendChild(toggle);
      } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'ds-tree-toggle-placeholder';
        row.appendChild(placeholder);
      }

      const iconEl = document.createElement('span');
      const iconExtra = resolveIconClass(key);
      iconEl.className = `ds-tree-icon ${iconExtra}`.trim();

      const labelEl = document.createElement('span');
      labelEl.className = 'ds-tree-label';
      labelEl.textContent = resolveLabel(key) || '';

      row.appendChild(iconEl);
      row.appendChild(labelEl);

      row.addEventListener('click', () => {
        runHandler(handleSelect, key);
      });
      row.addEventListener('dblclick', () => {
        if (!hasChildren) return;
        toggleExpanded(key);
      });
      row.addEventListener('contextmenu', (ev) => {
        if (!handleContextMenu) return;
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch {
          // ignore
        }
        runHandler(handleContextMenu, ev, key);
      });
      row.addEventListener('keydown', (ev) => {
        const k = ev?.key;
        if (!k) return;
        if (k === 'Enter') {
          try {
            ev.preventDefault();
          } catch {
            // ignore
          }
          runHandler(handleSelect, key);
          return;
        }
        if (k === ' ' || k === 'Spacebar') {
          if (!hasChildren) return;
          try {
            ev.preventDefault();
          } catch {
            // ignore
          }
          toggleExpanded(key);
          return;
        }
        if (k === 'ArrowRight') {
          if (!hasChildren || isExpanded) return;
          try {
            ev.preventDefault();
          } catch {
            // ignore
          }
          expandedKeys.add(key);
          render();
          return;
        }
        if (k === 'ArrowLeft') {
          if (!hasChildren || !isExpanded) return;
          try {
            ev.preventDefault();
          } catch {
            // ignore
          }
          expandedKeys.delete(key);
          render();
          return;
        }
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          try {
            ev.preventDefault();
          } catch {
            // ignore
          }
          const rows = Array.from(container.querySelectorAll('.ds-tree-row'));
          const index = rows.indexOf(row);
          if (index < 0) return;
          const nextIndex = k === 'ArrowDown' ? index + 1 : index - 1;
          const next = rows[nextIndex];
          if (!next) return;
          try {
            next.focus();
          } catch {
            // ignore
          }
        }
      });

      fragment.appendChild(row);
    });

    container.appendChild(fragment);
    try {
      container.scrollTop = prevScrollTop;
    } catch {
      // ignore
    }
  };

  render();

  return {
    render,
    expandAll,
    collapseAll,
    toggleExpanded,
    setExpandedKeys,
    getExpandedKeys: () => Array.from(expandedKeys),
  };
}

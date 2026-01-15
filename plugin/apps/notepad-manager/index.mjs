import { createNotesApi } from './api.mjs';
import { createNotepadLayerManager } from './layers.mjs';
import { normalizeString, setButtonEnabled } from './dom.mjs';
import { renderMarkdown } from './markdown.mjs';
import { parseTags, tagsToText } from './tags.mjs';
import { createNotepadManagerUi } from './ui.mjs';
import { createDsPathTreeView } from './ds-tree.mjs';

export function mount({ container, host, slots }) {
  if (!container) throw new Error('container is required');
  if (!host || typeof host !== 'object') throw new Error('host is required');

  const ctx =
    typeof host?.context?.get === 'function' ? host.context.get() : { pluginId: '', appId: '', theme: 'light' };
  const bridgeEnabled = Boolean(ctx?.bridge?.enabled);

  const api = createNotesApi({ host, bridgeEnabled });

  const {
    root,
    btnNewFolder,
    btnNewNote,
    btnSave,
    btnDelete,
    btnCopy,
    btnToggleEdit,
    createHint,
    searchInput,
    btnClearSearch,
    folderList,
    tagRow,
    titleInput,
    folderSelect,
    tagsInput,
    infoBox,
    textarea,
    preview,
    setStatus,
  } = createNotepadManagerUi({ container, slots, ctx, bridgeEnabled });
  const layoutBreakpoint = 960;
  const isCompactSurface = ctx?.surface === 'compact';
  let layoutObserver = null;
  let layoutResizeHandler = null;

  const resolveLayout = (width) => {
    if (isCompactSurface) return 'stacked';
    return width <= layoutBreakpoint ? 'stacked' : 'split';
  };

  const applyLayout = (width) => {
    if (!root) return;
    const next = resolveLayout(width);
    if (root.dataset.layout !== next) root.dataset.layout = next;
  };

  const readContainerWidth = () => {
    if (container?.getBoundingClientRect) return container.getBoundingClientRect().width;
    if (root?.getBoundingClientRect) return root.getBoundingClientRect().width;
    return 0;
  };

  applyLayout(readContainerWidth());

  if (typeof ResizeObserver !== 'undefined' && container?.nodeType === 1) {
    layoutObserver = new ResizeObserver((entries) => {
      const width = entries?.[0]?.contentRect?.width ?? readContainerWidth();
      applyLayout(width);
    });
    layoutObserver.observe(container);
  } else if (typeof window !== 'undefined') {
    layoutResizeHandler = () => applyLayout(readContainerWidth());
    window.addEventListener('resize', layoutResizeHandler);
  }

  let disposed = false;
  const { closeActiveLayer, showMenu, showDialog, confirmDialog } = createNotepadLayerManager({
    getDisposed: () => disposed,
    setStatus,
  });

  let folders = [];
  let tags = [];
  let notes = [];
  let selectedFolder = '';
  let selectedTags = [];
  let selectedNoteId = '';
  let currentNote = null;
  let currentContent = '';
  let dirty = false;
  let controlsEnabled = false;
  let editorMode = 'preview';
  let copying = false;
  let copyFeedbackTimer = null;
  let activeTreeKey = '';
  const NOTE_KEY_PREFIX = '__note__:';
  const noteIndex = new Map();
  let refreshFoldersSeq = 0;
  let refreshNotesSeq = 0;
  let openNoteSeq = 0;
  let searchDebounceTimer = null;
  let searchWasActive = false;
  let expandedKeysBeforeSearch = null;

  const makeNoteKey = (folder, id) => {
    const noteId = normalizeString(id);
    const folderPath = normalizeString(folder);
    if (!noteId) return folderPath || '';
    const segment = `${NOTE_KEY_PREFIX}${noteId}`;
    return folderPath ? `${folderPath}/${segment}` : segment;
  };

  const parseTreeKey = (key) => {
    const raw = typeof key === 'string' ? key.trim() : '';
    if (!raw) return { kind: 'folder', folder: '' };
    const parts = raw.split('/').filter(Boolean);
    if (parts.length === 0) return { kind: 'folder', folder: '' };
    const last = parts[parts.length - 1] || '';
    if (last.startsWith(NOTE_KEY_PREFIX)) {
      const noteId = last.slice(NOTE_KEY_PREFIX.length);
      const folder = parts.slice(0, -1).join('/');
      return { kind: 'note', folder, noteId };
    }
    return { kind: 'folder', folder: parts.join('/') };
  };

  const clearCopyFeedbackTimer = () => {
    if (!copyFeedbackTimer) return;
    try {
      clearTimeout(copyFeedbackTimer);
    } catch {
      // ignore
    }
    copyFeedbackTimer = null;
  };

  const flashCopyFeedback = (text) => {
    if (!btnCopy) return;
    const original = '复制';
    btnCopy.textContent = text;
    clearCopyFeedbackTimer();
    copyFeedbackTimer = setTimeout(() => {
      copyFeedbackTimer = null;
      btnCopy.textContent = original;
    }, 1000);
  };

  const syncEditorControls = () => {
    const hasNote = Boolean(currentNote);
    const editable = controlsEnabled && hasNote && editorMode === 'edit';

    setButtonEnabled(btnSave, editable);
    setButtonEnabled(btnDelete, controlsEnabled && hasNote);
    setButtonEnabled(btnCopy, controlsEnabled && hasNote && !copying);
    setButtonEnabled(btnToggleEdit, controlsEnabled && hasNote);

    titleInput.disabled = !editable;
    folderSelect.disabled = !editable;
    tagsInput.disabled = !editable;
    textarea.disabled = !editable;
  };

  const setEditorMode = (mode, { focus } = {}) => {
    editorMode = mode === 'edit' ? 'edit' : 'preview';
    if (root) root.dataset.editorMode = editorMode;
    if (btnToggleEdit) btnToggleEdit.textContent = editorMode === 'edit' ? '预览' : '编辑';
    syncEditorControls();
    if (focus && editorMode === 'edit') {
      try {
        textarea.focus();
      } catch {
        // ignore
      }
    }
  };

  const copyPlainText = async (text) => {
    const value = typeof text === 'string' ? text : String(text ?? '');
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '-1000px';
    el.style.left = '-1000px';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, el.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (!ok) throw new Error('copy failed');
  };

  const setControlsEnabled = (enabled) => {
    controlsEnabled = enabled;
    setButtonEnabled(btnNewFolder, enabled);
    setButtonEnabled(btnNewNote, enabled);
    searchInput.disabled = !enabled;
    setButtonEnabled(btnClearSearch, enabled);
    syncEditorControls();
  };

  const updateCreateHint = () => {
    const label = selectedFolder ? selectedFolder : '根目录';
    createHint.textContent = `新笔记将创建在：${label}`;
  };

  const showFolderMenu = (x, y, f) => {
    showMenu(x, y, [
      {
        label: '设为当前文件夹',
        onClick: async () => {
          selectedFolder = f;
          activeTreeKey = f;
          updateCreateHint();
          renderFolderList();
        },
      },
      {
        label: '在此新建笔记…',
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const values = await showDialog({
            title: '新建笔记',
            description: `目标文件夹：${f ? f : '根目录'}`,
            fields: [{ name: 'title', label: '标题', kind: 'text', value: '', placeholder: '可空' }],
            confirmText: '创建',
          });
          if (!values) return;
          const noteTitle = normalizeString(values.title);
          setStatus('Notes: creating note...', 'bad');
          const res = await api.createNote({ folder: f, title: noteTitle });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'create note failed'}`, 'bad');
            return;
          }
          selectedFolder = f;
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          const id = res?.note?.id || '';
          if (id) await openNote(id);
          setStatus('Notes: note created', 'ok');
        },
      },
      {
        label: '新建子文件夹…',
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const values = await showDialog({
            title: '新建文件夹',
            fields: [
              {
                name: 'folder',
                label: '文件夹路径',
                kind: 'text',
                value: f ? `${f}/` : '',
                placeholder: '例如：work/ideas',
                required: true,
              },
            ],
            confirmText: '创建',
          });
          if (!values) return;
          const folder = normalizeString(values.folder);
          if (!folder) return;
          setStatus('Notes: creating folder...', 'bad');
          const res = await api.createFolder({ folder });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'create folder failed'}`, 'bad');
            return;
          }
          selectedFolder = res?.folder || folder;
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: folder created', 'ok');
        },
      },
      {
        label: '重命名文件夹…',
        disabled: !f,
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const values = await showDialog({
            title: '重命名文件夹',
            description: `当前：${f}`,
            fields: [{ name: 'to', label: '新路径', kind: 'text', value: f, placeholder: '例如：work/notes', required: true }],
            confirmText: '重命名',
          });
          if (!values) return;
          const to = normalizeString(values.to);
          if (!to) return;
          setStatus('Notes: renaming folder...', 'bad');
          const res = await api.renameFolder({ from: f, to });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'rename failed'}`, 'bad');
            return;
          }
          if (selectedFolder === f) {
            selectedFolder = to;
          } else if (selectedFolder.startsWith(`${f}/`)) {
            selectedFolder = `${to}/${selectedFolder.slice(f.length + 1)}`;
          }
          if (currentNote?.folder === f) {
            currentNote.folder = to;
          } else if (currentNote?.folder && String(currentNote.folder).startsWith(`${f}/`)) {
            currentNote.folder = `${to}/${String(currentNote.folder).slice(f.length + 1)}`;
          }
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          renderEditor(true);
          setStatus('Notes: folder renamed', 'ok');
        },
      },
      {
        label: '删除文件夹（递归）',
        disabled: !f,
        danger: true,
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const ok = await confirmDialog(`确定删除文件夹「${f}」及其所有子目录与笔记吗？`, {
            title: '删除文件夹',
            danger: true,
            confirmText: '删除',
          });
          if (!ok) return;
          setStatus('Notes: deleting folder...', 'bad');
          const res = await api.deleteFolder({ folder: f, recursive: true });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'delete folder failed'}`, 'bad');
            return;
          }
          if (selectedFolder === f || selectedFolder.startsWith(`${f}/`)) {
            selectedFolder = '';
          }
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          renderEditor(true);
          setStatus('Notes: folder deleted', 'ok');
        },
      },
    ]);
  };

  const showNoteMenu = (x, y, n) => {
    const noteId = normalizeString(n?.id);
    if (!noteId) return;
    showMenu(x, y, [
      {
        label: noteId === selectedNoteId ? '当前已打开' : '打开',
        disabled: noteId === selectedNoteId,
        onClick: async () => {
          if (noteId === selectedNoteId) return;
          if (!(await ensureSafeToSwitch())) return;
          await openNote(noteId);
        },
      },
      {
        label: '重命名…',
        onClick: async () => {
          const values = await showDialog({
            title: '重命名笔记',
            description: `ID: ${noteId}`,
            fields: [{ name: 'title', label: '标题', kind: 'text', value: n?.title || '', placeholder: '例如：周报', required: true }],
            confirmText: '重命名',
          });
          if (!values) return;
          const nextTitle = normalizeString(values.title);
          if (!nextTitle) return;
          if (noteId === selectedNoteId && currentNote) {
            currentNote.title = nextTitle;
            try {
              titleInput.value = nextTitle;
            } catch {
              // ignore
            }
            dirty = true;
            renderEditor(false);
            await doSave();
            return;
          }
          setStatus('Notes: updating note...', 'bad');
          const res = await api.updateNote({ id: noteId, title: nextTitle });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'update failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: note updated', 'ok');
        },
      },
      {
        label: '移动到文件夹…',
        onClick: async () => {
          const options = (Array.isArray(folders) ? folders : ['']).map((f) => ({ value: f, label: f ? f : '（根目录）' }));
          const values = await showDialog({
            title: '移动笔记',
            description: `当前：${n?.folder ? n.folder : '根目录'}`,
            fields: [{ name: 'folder', label: '目标文件夹', kind: 'select', options, value: n?.folder || '' }],
            confirmText: '移动',
          });
          if (!values) return;
          const nextFolder = normalizeString(values.folder);
          if (noteId === selectedNoteId && currentNote) {
            currentNote.folder = nextFolder;
            try {
              folderSelect.value = nextFolder;
            } catch {
              // ignore
            }
            dirty = true;
            renderEditor(false);
            await doSave();
            return;
          }
          setStatus('Notes: moving note...', 'bad');
          const res = await api.updateNote({ id: noteId, folder: nextFolder });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'move failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: note moved', 'ok');
        },
      },
      {
        label: '设置标签…',
        onClick: async () => {
          const values = await showDialog({
            title: '设置标签',
            description: '用逗号分隔，例如：work, todo',
            fields: [{ name: 'tags', label: '标签', kind: 'text', value: tagsToText(n?.tags), placeholder: 'tag1, tag2' }],
            confirmText: '应用',
          });
          if (!values) return;
          const nextTags = parseTags(values.tags);
          if (noteId === selectedNoteId && currentNote) {
            currentNote.tags = nextTags;
            try {
              tagsInput.value = tagsToText(nextTags);
            } catch {
              // ignore
            }
            dirty = true;
            renderEditor(false);
            await doSave();
            return;
          }
          setStatus('Notes: updating tags...', 'bad');
          const res = await api.updateNote({ id: noteId, tags: nextTags });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'update failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: tags updated', 'ok');
        },
      },
      {
        label: '删除',
        danger: true,
        onClick: async () => {
          if (noteId === selectedNoteId && currentNote) {
            await doDelete();
            return;
          }
          const ok = await confirmDialog(`确定删除「${n?.title || 'Untitled'}」吗？`, {
            title: '删除笔记',
            danger: true,
            confirmText: '删除',
          });
          if (!ok) return;
          setStatus('Notes: deleting note...', 'bad');
          const res = await api.deleteNote({ id: noteId });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'delete failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: note deleted', 'ok');
        },
      },
    ]);
  };

  const showTreeMenu = (x, y, key) => {
    const parsed = parseTreeKey(key);
    if (parsed.kind === 'note') {
      const note = noteIndex.get(parsed.noteId);
      if (note) showNoteMenu(x, y, note);
      return;
    }
    showFolderMenu(x, y, parsed.folder);
  };

  const folderTree = createDsPathTreeView({
    container: folderList,
    getLabel: (key) => {
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const note = noteIndex.get(parsed.noteId);
        return note?.title || 'Untitled';
      }
      return parsed.folder ? parsed.folder.split('/').slice(-1)[0] : '（根目录）';
    },
    getTitle: (key) => {
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const note = noteIndex.get(parsed.noteId);
        const folderText = parsed.folder ? parsed.folder : '根目录';
        const updatedAt = note?.updatedAt ? ` · ${note.updatedAt}` : '';
        return `${note?.title || 'Untitled'} · ${folderText}${updatedAt}`;
      }
      return parsed.folder ? parsed.folder : '全部笔记的根目录';
    },
    getIconClass: (key) => {
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') return 'ds-tree-icon-note';
      return parsed.folder ? 'ds-tree-icon-folder' : 'ds-tree-icon-home';
    },
    getSortMeta: (key) => {
      if (!key) return { group: -1, label: '' };
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const note = noteIndex.get(parsed.noteId);
        return { group: 1, label: note?.title || 'Untitled' };
      }
      return { group: 0, label: parsed.folder.split('/').slice(-1)[0] };
    },
    onSelect: async (key) => {
      if (disposed) return;
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const noteId = parsed.noteId;
        if (!noteId) return;
        if (noteId === selectedNoteId) {
          if (activeTreeKey !== key) {
            activeTreeKey = key;
            renderFolderList();
          }
          return;
        }
        if (!(await ensureSafeToSwitch())) return;
        if (selectedFolder !== parsed.folder) {
          selectedFolder = parsed.folder;
          updateCreateHint();
        }
        activeTreeKey = key;
        renderFolderList();
        await openNote(noteId);
        return;
      }
      const folder = parsed.folder;
      if (folder === selectedFolder && activeTreeKey === folder) return;
      activeTreeKey = folder;
      selectedFolder = folder;
      updateCreateHint();
      renderFolderList();
    },
    onContextMenu: (ev, key) => {
      if (disposed) return;
      showTreeMenu(ev?.clientX ?? 0, ev?.clientY ?? 0, key);
    },
  });

  const ensureSafeToSwitch = async () => {
    if (!dirty) return true;
    return await confirmDialog('当前笔记有未保存的修改，确定丢弃并继续吗？', {
      title: '未保存的更改',
      danger: true,
      confirmText: '丢弃并继续',
    });
  };

  const renderFolderOptions = () => {
    folderSelect.innerHTML = '';
    const opts = [''].concat(folders.filter((f) => f !== ''));
    for (const f of opts) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f ? f : '（根目录）';
      folderSelect.appendChild(opt);
    }
  };

  const renderFolderList = () => {
    const query = normalizeString(searchInput.value);
    const isFiltering = Boolean(query) || selectedTags.length > 0;

    const paths = isFiltering ? [] : Array.isArray(folders) ? [...folders] : [];
    if (isFiltering && selectedFolder) paths.push(selectedFolder);
    const currentId = normalizeString(currentNote?.id);
    (Array.isArray(notes) ? notes : []).forEach((n) => {
      const id = normalizeString(n?.id);
      if (!id) return;
      if (currentId && id === currentId) return;
      paths.push(makeNoteKey(n?.folder, id));
    });
    if (currentId) {
      paths.push(makeNoteKey(normalizeString(currentNote?.folder) || selectedFolder, currentId));
    }

    const fallbackKey = selectedNoteId
      ? makeNoteKey(normalizeString(currentNote?.folder) || selectedFolder, selectedNoteId)
      : selectedFolder;
    const selectedKey = activeTreeKey || fallbackKey;

    const parsed = parseTreeKey(selectedKey);
    const folderToExpand = parsed.kind === 'note' ? parsed.folder : parsed.folder;
    if (!isFiltering && searchWasActive) {
      searchWasActive = false;
      folderTree.setExpandedKeys(Array.isArray(expandedKeysBeforeSearch) ? expandedKeysBeforeSearch : ['']);
      expandedKeysBeforeSearch = null;
    }

    if (isFiltering && !searchWasActive) {
      searchWasActive = true;
      expandedKeysBeforeSearch = folderTree.getExpandedKeys();
    }

    const expanded = new Set(isFiltering ? [''] : folderTree.getExpandedKeys());
    expanded.add('');
    if (folderToExpand) expanded.add(folderToExpand);
    if (isFiltering) {
      const addFolderAndParents = (folder) => {
        const value = normalizeString(folder);
        if (!value) return;
        const parts = value.split('/').filter(Boolean);
        let acc = '';
        for (const part of parts) {
          acc = acc ? `${acc}/${part}` : part;
          expanded.add(acc);
        }
      };
      notes.forEach((n) => addFolderAndParents(n?.folder));
      addFolderAndParents(selectedFolder);
      if (currentNote?.folder) addFolderAndParents(currentNote.folder);
    }
    folderTree.setExpandedKeys(Array.from(expanded));

    folderTree.render({ paths, selectedKey });
  };

  const renderTags = () => {
    if (!tagRow || !tagRow.isConnected) return;
    tagRow.innerHTML = '';
    if (!Array.isArray(tags) || tags.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'np-meta';
      empty.textContent = '暂无标签';
      tagRow.appendChild(empty);
      return;
    }
    for (const t of tags) {
      const chip = document.createElement('div');
      chip.className = 'np-chip';
      chip.dataset.active = selectedTags.some((x) => x.toLowerCase() === String(t.tag || '').toLowerCase()) ? '1' : '0';
      chip.textContent = `${t.tag} (${t.count})`;
      chip.addEventListener('click', async () => {
        if (disposed) return;
        const key = String(t.tag || '').toLowerCase();
        const idx = selectedTags.findIndex((x) => x.toLowerCase() === key);
        if (idx >= 0) selectedTags.splice(idx, 1);
        else selectedTags.push(t.tag);
        await refreshNotes();
        renderTags();
      });
      tagRow.appendChild(chip);
    }
  };

  const renderEditor = (force = false) => {
    if (!currentNote) {
      infoBox.textContent = '未选择笔记';
      titleInput.value = '';
      tagsInput.value = '';
      textarea.value = '';
      preview.innerHTML = '<div class="np-meta">预览区</div>';
      setEditorMode('preview');
      return;
    }
    infoBox.textContent = dirty ? `未保存 · ${currentNote.updatedAt || ''}` : `${currentNote.updatedAt || ''}`;
    if (force || document.activeElement !== titleInput) titleInput.value = currentNote.title || '';
    if (force || document.activeElement !== folderSelect) folderSelect.value = currentNote.folder || '';
    if (force || document.activeElement !== tagsInput) tagsInput.value = tagsToText(currentNote.tags);
    if (force || document.activeElement !== textarea) textarea.value = currentContent;
    preview.innerHTML = renderMarkdown(currentContent);
    syncEditorControls();
  };

  const refreshFoldersAndTags = async () => {
    const seq = (refreshFoldersSeq += 1);
    let folderRes = null;
    let tagRes = null;
    const shouldLoadTags = Boolean(tagRow && tagRow.isConnected);
    try {
      [folderRes, tagRes] = await Promise.all([
        api.listFolders(),
        shouldLoadTags ? api.listTags() : Promise.resolve({ ok: true, tags: [] }),
      ]);
    } catch (err) {
      if (disposed || seq !== refreshFoldersSeq) return;
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (disposed || seq !== refreshFoldersSeq) return;

    folders = Array.isArray(folderRes?.folders) ? folderRes.folders : [''];
    if (!folders.includes('')) folders.unshift('');
    tags = Array.isArray(tagRes?.tags) ? tagRes.tags : [];
    renderFolderOptions();
    renderFolderList();
    if (shouldLoadTags) renderTags();
  };

  const refreshNotes = async () => {
    const seq = (refreshNotesSeq += 1);
    const query = normalizeString(searchInput.value);
    const includeContent = query.length >= 2;
    let res = null;
    try {
      if (!query || !includeContent) {
        res = await api.listNotes({
          folder: '',
          recursive: true,
          tags: selectedTags,
          match: 'all',
          query,
          limit: 500,
        });
      } else {
        res = await api.searchNotes({
          query,
          folder: '',
          recursive: true,
          tags: selectedTags,
          match: 'all',
          includeContent: true,
          limit: 200,
        });
      }
    } catch (err) {
      if (disposed || seq !== refreshNotesSeq) return;
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (disposed || seq !== refreshNotesSeq) return;

    if (!res?.ok) {
      notes = [];
      setStatus(`Notes: ${res?.message || 'list notes failed'}`, 'bad');
    } else {
      notes = Array.isArray(res?.notes) ? res.notes : [];
    }
    noteIndex.clear();
    notes.forEach((n) => {
      const id = normalizeString(n?.id);
      if (!id) return;
      noteIndex.set(id, n);
    });
    const currentId = normalizeString(currentNote?.id);
    if (currentId && currentNote) noteIndex.set(currentId, currentNote);
    renderFolderList();
  };

  const openNote = async (id) => {
    const seq = (openNoteSeq += 1);
    let res = null;
    try {
      res = await api.getNote({ id });
    } catch (err) {
      if (disposed || seq !== openNoteSeq) return false;
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return false;
    }
    if (disposed || seq !== openNoteSeq) return false;
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'load failed'}`, 'bad');
      return false;
    }
    selectedNoteId = id;
    currentNote = res.note || null;
    currentContent = String(res.content ?? '');
    dirty = false;
    setEditorMode('preview');
    activeTreeKey = makeNoteKey(res.note?.folder, id);
    if (currentNote) noteIndex.set(id, currentNote);
    renderFolderList();
    renderEditor(true);
    return true;
  };

  const doSave = async () => {
    if (!currentNote) return;
    const nextTitle = normalizeString(titleInput.value);
    const nextFolder = normalizeString(folderSelect.value);
    const nextTags = parseTags(tagsInput.value);
    let res = null;
    try {
      res = await api.updateNote({ id: currentNote.id, title: nextTitle, folder: nextFolder, tags: nextTags, content: currentContent });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'save failed'}`, 'bad');
      return;
    }
    currentNote = res.note || currentNote;
    dirty = false;
    setStatus('Notes: saved', 'ok');
    await refreshFoldersAndTags();
    await refreshNotes();
    renderEditor(true);
  };

  const doDelete = async () => {
    if (!currentNote) return;
    const ok = await confirmDialog(`确定删除「${currentNote.title || 'Untitled'}」吗？`, {
      title: '删除笔记',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    let res = null;
    try {
      res = await api.deleteNote({ id: currentNote.id });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'delete failed'}`, 'bad');
      return;
    }
    selectedNoteId = '';
    currentNote = null;
    currentContent = '';
    dirty = false;
    setStatus('Notes: deleted', 'ok');
    await refreshFoldersAndTags();
    await refreshNotes();
    renderEditor(true);
  };

  btnNewFolder.addEventListener('click', async () => {
    if (disposed) return;
    const values = await showDialog({
      title: '新建文件夹',
      fields: [
        {
          name: 'folder',
          label: '文件夹路径',
          kind: 'text',
          value: selectedFolder ? `${selectedFolder}/` : '',
          placeholder: '例如：work/ideas',
          required: true,
        },
      ],
      confirmText: '创建',
    });
    if (!values) return;
    const folder = normalizeString(values.folder);
    if (!folder) return;
    setStatus('Notes: creating folder...', 'bad');
    let res = null;
    try {
      res = await api.createFolder({ folder });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'create folder failed'}`, 'bad');
      return;
    }
    const created = normalizeString(res?.folder) || folder;
    if (created && !dirty) {
      selectedFolder = created;
      updateCreateHint();
    }
    await refreshFoldersAndTags();
    if (created && !dirty) {
      await refreshNotes();
    }
    setStatus('Notes: folder created', 'ok');
  });

  btnNewNote.addEventListener('click', async () => {
    if (disposed) return;
    if (!(await ensureSafeToSwitch())) return;
    const values = await showDialog({
      title: '新建笔记',
      description: `目标文件夹：${selectedFolder ? selectedFolder : '根目录'}`,
      fields: [{ name: 'title', label: '标题', kind: 'text', value: '', placeholder: '可空' }],
      confirmText: '创建',
    });
    if (!values) return;
    const title = normalizeString(values.title);
    setStatus('Notes: creating note...', 'bad');
    let res = null;
    try {
      res = await api.createNote({ folder: selectedFolder, title });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'create note failed'}`, 'bad');
      return;
    }
    await refreshFoldersAndTags();
    await refreshNotes();
    const id = res?.note?.id || '';
    if (id) await openNote(id);
    setStatus('Notes: note created', 'ok');
  });

  btnSave.addEventListener('click', () => doSave());
  btnDelete.addEventListener('click', () => doDelete());
  btnToggleEdit.addEventListener('click', () => {
    if (disposed || !currentNote) return;
    setEditorMode(editorMode === 'edit' ? 'preview' : 'edit', { focus: true });
  });
  btnCopy.addEventListener('click', async () => {
    if (disposed || !currentNote || copying) return;
    copying = true;
    syncEditorControls();
    try {
      await copyPlainText(currentContent || '');
      flashCopyFeedback('已复制');
    } catch {
      flashCopyFeedback('复制失败');
    } finally {
      copying = false;
      syncEditorControls();
    }
  });

  searchInput.addEventListener('input', async () => {
    if (disposed) return;
    if (searchDebounceTimer) {
      try {
        clearTimeout(searchDebounceTimer);
      } catch {
        // ignore
      }
    }
    const query = normalizeString(searchInput.value);
    const delayMs = query.length >= 2 ? 320 : 180;
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      refreshNotes();
    }, delayMs);
  });

  searchInput.addEventListener('keydown', async (ev) => {
    if (disposed) return;
    const key = ev?.key;
    if (key === 'Escape') {
      try {
        ev.preventDefault();
      } catch {
        // ignore
      }
      if (!searchInput.value) return;
      if (searchDebounceTimer) {
        try {
          clearTimeout(searchDebounceTimer);
        } catch {
          // ignore
        }
        searchDebounceTimer = null;
      }
      searchInput.value = '';
      await refreshNotes();
      return;
    }
    if (key !== 'Enter') return;
    if (!normalizeString(searchInput.value)) return;
    if (!(await ensureSafeToSwitch())) return;
    const first = Array.isArray(notes) && notes.length > 0 ? notes[0] : null;
    const id = normalizeString(first?.id);
    if (!id) return;
    try {
      ev.preventDefault();
    } catch {
      // ignore
    }
    await openNote(id);
  });

  btnClearSearch?.addEventListener('click', async () => {
    if (disposed) return;
    if (!searchInput.value) return;
    if (searchDebounceTimer) {
      try {
        clearTimeout(searchDebounceTimer);
      } catch {
        // ignore
      }
      searchDebounceTimer = null;
    }
    searchInput.value = '';
    await refreshNotes();
    try {
      searchInput.focus();
    } catch {
      // ignore
    }
  });

  titleInput.addEventListener('input', () => {
    if (!currentNote) return;
    dirty = true;
    currentNote.title = normalizeString(titleInput.value);
    renderEditor(false);
  });

  folderSelect.addEventListener('change', () => {
    if (!currentNote) return;
    dirty = true;
    currentNote.folder = normalizeString(folderSelect.value);
    renderEditor(false);
  });

  tagsInput.addEventListener('input', () => {
    if (!currentNote) return;
    dirty = true;
    currentNote.tags = parseTags(tagsInput.value);
    renderEditor(false);
  });

  textarea.addEventListener('input', () => {
    if (!currentNote) return;
    dirty = true;
    currentContent = String(textarea.value ?? '');
    renderEditor(false);
  });

  const bootstrap = async () => {
    if (!bridgeEnabled) {
      setControlsEnabled(false);
      setStatus('Notes: bridge disabled (must run in ChatOS desktop UI)', 'bad');
      return;
    }
    setControlsEnabled(false);
    try {
      const res = await api.init();
      if (!res?.ok) {
        setStatus(`Notes: ${res?.message || 'init failed'}`, 'bad');
        return;
      }
      await refreshFoldersAndTags();
      await refreshNotes();
      updateCreateHint();
      setStatus('Notes: ready', 'ok');
      setControlsEnabled(true);
      renderEditor(true);
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
    }
  };

  bootstrap();

  return () => {
    disposed = true;
    clearCopyFeedbackTimer();
    if (searchDebounceTimer) {
      try {
        clearTimeout(searchDebounceTimer);
      } catch {
        // ignore
      }
      searchDebounceTimer = null;
    }
    if (layoutObserver) {
      try {
        layoutObserver.disconnect();
      } catch {
        // ignore
      }
      layoutObserver = null;
    }
    if (layoutResizeHandler && typeof window !== 'undefined') {
      try {
        window.removeEventListener('resize', layoutResizeHandler);
      } catch {
        // ignore
      }
      layoutResizeHandler = null;
    }
    closeActiveLayer();
  };
}



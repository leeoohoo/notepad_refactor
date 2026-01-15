import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const INDEX_VERSION = 1;

const DEFAULT_LOCK_TIMEOUT_MS = 10_000;
const DEFAULT_LOCK_STALE_MS = 30_000;
const DEFAULT_LOCK_POLL_MS = 25;

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value) {
  const out = normalizeString(value);
  return out ? out : '';
}

function normalizeTag(value) {
  const tag = normalizeString(value);
  if (!tag) return '';
  return tag;
}

function uniqTags(tags) {
  const out = [];
  const seen = new Set();
  (Array.isArray(tags) ? tags : []).forEach((t) => {
    const tag = normalizeTag(t);
    if (!tag) return;
    const key = tag.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(tag);
  });
  return out;
}

function isValidPathSegment(seg) {
  const s = String(seg || '').trim();
  if (!s) return false;
  if (s === '.' || s === '..') return false;
  // Windows reserved characters: <>:"/\|?*
  if (/[<>:"/\\|?*\0]/.test(s)) return false;
  // Control chars
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(s)) return false;
  return true;
}

function normalizeFolderPath(value) {
  const raw = normalizeOptionalString(value).replace(/\\/g, '/');
  if (!raw) return '';
  const cleaned = raw.replace(/^\/+|\/+$/g, '');
  if (!cleaned) return '';
  const parts = cleaned.split('/').filter(Boolean);
  for (const part of parts) {
    if (!isValidPathSegment(part)) {
      throw new Error(`Invalid folder segment: ${part}`);
    }
  }
  return parts.join('/');
}

function splitFolder(folder) {
  const f = normalizeOptionalString(folder).replace(/\\/g, '/');
  if (!f) return [];
  return f.split('/').filter(Boolean);
}

function joinPosix(...parts) {
  const filtered = parts.filter((p) => typeof p === 'string' && p.trim());
  return path.posix.join(...filtered);
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureDir(dirPath) {
  const p = normalizeOptionalString(dirPath);
  if (!p) return;
  await fs.promises.mkdir(p, { recursive: true });
}

async function isDirectory(dirPath) {
  try {
    const stat = await fs.promises.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

async function isFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function atomicWriteText(filePath, text) {
  const target = normalizeOptionalString(filePath);
  if (!target) throw new Error('filePath is required');
  const dir = path.dirname(target);
  await ensureDir(dir);
  const base = path.basename(target);
  const tmp = path.join(dir, `.${base}.${process.pid}.${Date.now().toString(36)}.tmp`);
  await fs.promises.writeFile(tmp, String(text ?? ''), 'utf8');
  try {
    await fs.promises.rename(tmp, target);
  } catch (err) {
    try {
      await fs.promises.unlink(target);
      await fs.promises.rename(tmp, target);
    } catch (err2) {
      try {
        await fs.promises.unlink(tmp);
      } catch {
        // ignore
      }
      throw err2;
    }
  }
}

async function tryAcquireLock(lockPath) {
  const p = normalizeOptionalString(lockPath);
  if (!p) throw new Error('lockPath is required');
  await ensureDir(path.dirname(p));
  try {
    const handle = await fs.promises.open(p, 'wx');
    try {
      await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: nowIso() }), { encoding: 'utf8' });
    } catch {
      // ignore
    }
    return handle;
  } catch (err) {
    if (err?.code === 'EEXIST') return null;
    throw err;
  }
}

async function withFileLock(lockPath, fn, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_LOCK_TIMEOUT_MS;
  const pollMs = Number.isFinite(options.pollMs) ? options.pollMs : DEFAULT_LOCK_POLL_MS;
  const staleMs = Number.isFinite(options.staleMs) ? options.staleMs : DEFAULT_LOCK_STALE_MS;
  const start = Date.now();

  while (true) {
    const handle = await tryAcquireLock(lockPath);
    if (handle) {
      try {
        return await fn();
      } finally {
        try {
          await handle.close();
        } catch {
          // ignore
        }
        try {
          await fs.promises.unlink(lockPath);
        } catch {
          // ignore
        }
      }
    }

    try {
      const stat = await fs.promises.stat(lockPath);
      const mtimeMs = typeof stat?.mtimeMs === 'number' ? stat.mtimeMs : 0;
      if (mtimeMs && Date.now() - mtimeMs > staleMs) {
        await fs.promises.unlink(lockPath);
        continue;
      }
    } catch {
      // ignore
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for lock (${path.basename(lockPath)}).`);
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

function extractTitleFromMarkdown(markdown) {
  const text = String(markdown || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    const heading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (heading) {
      return String(heading[1] || '').trim().slice(0, 120) || '';
    }
    return trimmed.slice(0, 120);
  }
  return '';
}

function normalizeTitle(value) {
  const title = normalizeOptionalString(value);
  return title ? title.slice(0, 120) : '';
}

function noteFileAbs(notesRoot, folder, id) {
  const segments = splitFolder(folder);
  return path.join(notesRoot, ...segments, `${id}.md`);
}

function noteFileRel(folder, id) {
  const folderNorm = normalizeOptionalString(folder).replace(/\\/g, '/');
  return joinPosix('notes', folderNorm, `${id}.md`);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeIndex(index) {
  const obj = index && typeof index === 'object' ? index : {};
  const version = Number(obj.version) || INDEX_VERSION;
  const rawNotes = Array.isArray(obj.notes) ? obj.notes : [];
  const notes = [];
  const seen = new Set();
  rawNotes.forEach((n) => {
    if (!n || typeof n !== 'object') return;
    const id = normalizeOptionalString(n.id);
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);
    notes.push({
      id,
      title: normalizeTitle(n.title),
      folder: normalizeOptionalString(n.folder).replace(/\\/g, '/'),
      tags: uniqTags(n.tags),
      createdAt: normalizeOptionalString(n.createdAt),
      updatedAt: normalizeOptionalString(n.updatedAt),
    });
  });
  return { version, notes };
}

async function listMarkdownFiles(notesRoot, rel = '') {
  const absDir = rel ? path.join(notesRoot, ...splitFolder(rel)) : notesRoot;
  let entries = [];
  try {
    entries = await fs.promises.readdir(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results = [];
  for (const entry of entries) {
    const name = String(entry?.name || '');
    if (!name) continue;
    if (entry.isDirectory()) {
      const nextRel = rel ? `${rel}/${name}` : name;
      results.push(...(await listMarkdownFiles(notesRoot, nextRel)));
      continue;
    }
    if (!entry.isFile()) continue;
    if (!name.toLowerCase().endsWith('.md')) continue;
    const id = name.slice(0, -3);
    if (!id) continue;
    const fileAbs = rel ? path.join(notesRoot, ...splitFolder(rel), name) : path.join(notesRoot, name);
    results.push({ id, folder: rel, fileAbs });
  }
  return results;
}

async function rebuildIndexFromFilesystem(notesRoot) {
  const files = await listMarkdownFiles(notesRoot);
  const now = nowIso();
  const notes = [];
  for (const f of files) {
    let content = '';
    try {
      content = await fs.promises.readFile(f.fileAbs, 'utf8');
    } catch {
      content = '';
    }
    let stat = null;
    try {
      stat = await fs.promises.stat(f.fileAbs);
    } catch {
      stat = null;
    }
    const createdAt = stat?.birthtime ? new Date(stat.birthtime).toISOString() : stat?.mtime ? new Date(stat.mtime).toISOString() : now;
    const updatedAt = stat?.mtime ? new Date(stat.mtime).toISOString() : now;
    notes.push({
      id: f.id,
      title: normalizeTitle(extractTitleFromMarkdown(content)) || 'Untitled',
      folder: normalizeOptionalString(f.folder),
      tags: [],
      createdAt,
      updatedAt,
    });
  }
  return { version: INDEX_VERSION, notes };
}

export function createNotepadStore({ dataDir } = {}) {
  const baseDirRaw = normalizeOptionalString(dataDir);
  if (!baseDirRaw) {
    throw new Error('dataDir is required');
  }
  const baseDir = path.resolve(baseDirRaw);
  const notesRoot = path.join(baseDir, 'notes');
  const indexPath = path.join(baseDir, 'notes-index.json');
  const lockPath = path.join(baseDir, 'notes.lock');

  const loadIndexLocked = async () => {
    await ensureDir(notesRoot);
    const exists = await isFile(indexPath);
    if (!exists) {
      const rebuilt = await rebuildIndexFromFilesystem(notesRoot);
      await atomicWriteText(indexPath, JSON.stringify(rebuilt, null, 2));
      return rebuilt;
    }

    let raw = '';
    try {
      raw = await fs.promises.readFile(indexPath, 'utf8');
    } catch (err) {
      if (err?.code === 'ENOENT') {
        const rebuilt = await rebuildIndexFromFilesystem(notesRoot);
        await atomicWriteText(indexPath, JSON.stringify(rebuilt, null, 2));
        return rebuilt;
      }
      throw err;
    }

    let parsed = null;
    try {
      parsed = JSON.parse(String(raw || ''));
    } catch {
      const backup = path.join(baseDir, `notes-index.corrupted.${Date.now().toString(36)}.json`);
      try {
        await fs.promises.copyFile(indexPath, backup);
      } catch {
        // ignore
      }
      const rebuilt = await rebuildIndexFromFilesystem(notesRoot);
      await atomicWriteText(indexPath, JSON.stringify(rebuilt, null, 2));
      return rebuilt;
    }

    const normalized = normalizeIndex(parsed);
    if (normalized.version !== INDEX_VERSION) {
      // currently: keep data, bump version
      normalized.version = INDEX_VERSION;
      await atomicWriteText(indexPath, JSON.stringify(normalized, null, 2));
    }
    return normalized;
  };

  const saveIndexLocked = async (index) => {
    const normalized = normalizeIndex(index);
    normalized.version = INDEX_VERSION;
    await atomicWriteText(indexPath, JSON.stringify(normalized, null, 2));
    return normalized;
  };

  const getIndexSnapshot = async () =>
    await withFileLock(lockPath, async () => clone(await loadIndexLocked()));

  const init = async () => {
    const index = await getIndexSnapshot();
    return {
      ok: true,
      dataDir: baseDir,
      notesRoot,
      indexPath,
      version: INDEX_VERSION,
      notes: index?.notes?.length || 0,
    };
  };

  const listFolders = async () => {
    await ensureDir(notesRoot);
    const folders = [''];
    const walk = async (absDir, relDir) => {
      let entries = [];
      try {
        entries = await fs.promises.readdir(absDir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (!entry?.isDirectory?.()) continue;
        const name = String(entry.name || '');
        if (!name) continue;
        const nextRel = relDir ? `${relDir}/${name}` : name;
        folders.push(nextRel);
        await walk(path.join(absDir, name), nextRel);
      }
    };
    await walk(notesRoot, '');
    folders.sort((a, b) => a.localeCompare(b));
    return { ok: true, folders };
  };

  const createFolder = async ({ folder } = {}) => {
    let rel = '';
    try {
      rel = normalizeFolderPath(folder);
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }
    if (!rel) return { ok: false, message: 'folder is required' };
    const abs = path.join(notesRoot, ...splitFolder(rel));
    try {
      await ensureDir(abs);
      return { ok: true, folder: rel };
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }
  };

  const renameFolder = async ({ from, to } = {}) =>
    await withFileLock(lockPath, async () => {
      let fromRel = '';
      let toRel = '';
      try {
        fromRel = normalizeFolderPath(from);
      } catch (err) {
        return { ok: false, message: err?.message || String(err) };
      }
      try {
        toRel = normalizeFolderPath(to);
      } catch (err) {
        return { ok: false, message: err?.message || String(err) };
      }
      if (!fromRel) return { ok: false, message: 'from is required' };
      if (!toRel) return { ok: false, message: 'to is required' };
      if (fromRel === toRel) return { ok: true, from: fromRel, to: toRel, movedNotes: 0 };

      const fromAbs = path.join(notesRoot, ...splitFolder(fromRel));
      const toAbs = path.join(notesRoot, ...splitFolder(toRel));
      if (!(await isDirectory(fromAbs))) return { ok: false, message: `Folder not found: ${fromRel}` };
      if (await isDirectory(toAbs)) return { ok: false, message: `Target folder already exists: ${toRel}` };

      await ensureDir(path.dirname(toAbs));
      await fs.promises.rename(fromAbs, toAbs);

      const index = await loadIndexLocked();
      let movedNotes = 0;
      index.notes = index.notes.map((n) => {
        const folder = normalizeOptionalString(n.folder).replace(/\\/g, '/');
        if (folder === fromRel) {
          movedNotes += 1;
          return { ...n, folder: toRel, updatedAt: nowIso() };
        }
        if (folder.startsWith(`${fromRel}/`)) {
          movedNotes += 1;
          return { ...n, folder: `${toRel}/${folder.slice(fromRel.length + 1)}`, updatedAt: nowIso() };
        }
        return n;
      });
      await saveIndexLocked(index);
      return { ok: true, from: fromRel, to: toRel, movedNotes };
    });

  const deleteFolder = async ({ folder, recursive = false } = {}) =>
    await withFileLock(lockPath, async () => {
      let rel = '';
      try {
        rel = normalizeFolderPath(folder);
      } catch (err) {
        return { ok: false, message: err?.message || String(err) };
      }
      if (!rel) return { ok: false, message: 'folder is required' };
      const abs = path.join(notesRoot, ...splitFolder(rel));
      if (!(await isDirectory(abs))) return { ok: false, message: `Folder not found: ${rel}` };

      const index = await loadIndexLocked();
      const affected = index.notes.filter((n) => {
        const f = normalizeOptionalString(n.folder).replace(/\\/g, '/');
        return f === rel || f.startsWith(`${rel}/`);
      });

      if (!recursive) {
        try {
          await fs.promises.rmdir(abs);
        } catch (err) {
          return { ok: false, message: err?.message || String(err) };
        }
        return { ok: true, folder: rel, deletedNotes: 0 };
      }

      try {
        await fs.promises.rm(abs, { recursive: true, force: true });
      } catch (err) {
        return { ok: false, message: err?.message || String(err) };
      }

      const toRemove = new Set(affected.map((n) => n.id));
      index.notes = index.notes.filter((n) => !toRemove.has(n.id));
      await saveIndexLocked(index);

      return { ok: true, folder: rel, deletedNotes: affected.length };
    });

  const listNotes = async ({ folder = '', recursive = true, tags = [], match = 'all', query = '', limit = 200 } = {}) => {
    let folderRel = '';
    try {
      folderRel = normalizeFolderPath(folder);
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }
    const desiredTags = uniqTags(tags);
    const matchMode = match === 'any' ? 'any' : 'all';
    const q = normalizeOptionalString(query).toLowerCase();
    const max = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 200;

    const index = await getIndexSnapshot();
    let notes = Array.isArray(index?.notes) ? index.notes.slice() : [];

    if (folderRel) {
      const prefix = `${folderRel}/`;
      notes = notes.filter((n) => {
        const f = normalizeOptionalString(n.folder).replace(/\\/g, '/');
        if (f === folderRel) return true;
        if (recursive === false) return false;
        return f.startsWith(prefix);
      });
    }

    if (desiredTags.length > 0) {
      const desiredKeys = desiredTags.map((t) => t.toLowerCase());
      notes = notes.filter((n) => {
        const tagKeys = new Set((Array.isArray(n.tags) ? n.tags : []).map((t) => String(t || '').toLowerCase()));
        if (matchMode === 'any') return desiredKeys.some((t) => tagKeys.has(t));
        return desiredKeys.every((t) => tagKeys.has(t));
      });
    }

    if (q) {
      notes = notes.filter((n) => {
        const title = normalizeOptionalString(n.title).toLowerCase();
        const folderName = normalizeOptionalString(n.folder).toLowerCase();
        return title.includes(q) || folderName.includes(q);
      });
    }

    notes.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return { ok: true, notes: notes.slice(0, max) };
  };

  const createNote = async ({ folder = '', title = '', content = '', tags = [] } = {}) =>
    await withFileLock(lockPath, async () => {
      let folderRel = '';
      try {
        folderRel = normalizeFolderPath(folder);
      } catch (err) {
        return { ok: false, message: err?.message || String(err) };
      }
      const desiredTags = uniqTags(tags);

      const rawTitle = normalizeTitle(title) || normalizeTitle(extractTitleFromMarkdown(content)) || 'Untitled';
      const md = normalizeOptionalString(content) || `# ${rawTitle}\n\n`;

      const id = crypto.randomUUID();
      const abs = noteFileAbs(notesRoot, folderRel, id);
      await ensureDir(path.dirname(abs));
      await atomicWriteText(abs, md);

      const index = await loadIndexLocked();
      const now = nowIso();
      const note = {
        id,
        title: rawTitle,
        folder: folderRel,
        tags: desiredTags,
        createdAt: now,
        updatedAt: now,
      };
      index.notes.unshift(note);
      await saveIndexLocked(index);

      return { ok: true, note: { ...note, file: noteFileRel(folderRel, id) } };
    });

  const getNote = async ({ id } = {}) => {
    const noteId = normalizeOptionalString(id);
    if (!noteId) return { ok: false, message: 'id is required' };
    const index = await getIndexSnapshot();
    const note = (Array.isArray(index?.notes) ? index.notes : []).find((n) => n.id === noteId);
    if (!note) return { ok: false, message: `Note not found: ${noteId}` };

    const abs = noteFileAbs(notesRoot, note.folder, noteId);
    let content = '';
    try {
      content = await fs.promises.readFile(abs, 'utf8');
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }

    return { ok: true, note: { ...note, file: noteFileRel(note.folder, noteId) }, content };
  };

  const updateNote = async ({ id, title, content, folder, tags } = {}) =>
    await withFileLock(lockPath, async () => {
      const noteId = normalizeOptionalString(id);
      if (!noteId) return { ok: false, message: 'id is required' };
      const index = await loadIndexLocked();
      const idx = index.notes.findIndex((n) => n.id === noteId);
      if (idx < 0) return { ok: false, message: `Note not found: ${noteId}` };

      const current = index.notes[idx];
      let nextFolder = normalizeOptionalString(current.folder).replace(/\\/g, '/');
      if (folder !== undefined) {
        try {
          nextFolder = normalizeFolderPath(folder);
        } catch (err) {
          return { ok: false, message: err?.message || String(err) };
        }
      }
      const nextTitle = title !== undefined ? normalizeTitle(title) : normalizeOptionalString(current.title);
      const nextTags = tags !== undefined ? uniqTags(tags) : uniqTags(current.tags);
      const nextContent = content !== undefined ? String(content ?? '') : null;

      const oldAbs = noteFileAbs(notesRoot, current.folder, noteId);
      const newAbs = noteFileAbs(notesRoot, nextFolder, noteId);

      if (newAbs !== oldAbs) {
        await ensureDir(path.dirname(newAbs));
        try {
          await fs.promises.rename(oldAbs, newAbs);
        } catch (err) {
          return { ok: false, message: err?.message || String(err) };
        }
      }

      if (nextContent !== null) {
        try {
          await atomicWriteText(newAbs, nextContent);
        } catch (err) {
          return { ok: false, message: err?.message || String(err) };
        }
      }

      const now = nowIso();
      const updated = {
        ...current,
        title: nextTitle,
        folder: nextFolder,
        tags: nextTags,
        updatedAt: now,
      };
      index.notes[idx] = updated;
      await saveIndexLocked(index);

      return { ok: true, note: { ...updated, file: noteFileRel(updated.folder, noteId) } };
    });

  const deleteNote = async ({ id } = {}) =>
    await withFileLock(lockPath, async () => {
      const noteId = normalizeOptionalString(id);
      if (!noteId) return { ok: false, message: 'id is required' };
      const index = await loadIndexLocked();
      const idx = index.notes.findIndex((n) => n.id === noteId);
      if (idx < 0) return { ok: false, message: `Note not found: ${noteId}` };
      const note = index.notes[idx];

      const abs = noteFileAbs(notesRoot, note.folder, noteId);
      try {
        await fs.promises.unlink(abs);
      } catch {
        // ignore
      }
      index.notes.splice(idx, 1);
      await saveIndexLocked(index);
      return { ok: true, id: noteId };
    });

  const listTags = async () => {
    const index = await getIndexSnapshot();
    const counts = new Map();
    (Array.isArray(index?.notes) ? index.notes : []).forEach((n) => {
      (Array.isArray(n.tags) ? n.tags : []).forEach((t) => {
        const tag = normalizeTag(t);
        if (!tag) return;
        const key = tag.toLowerCase();
        counts.set(key, { tag, count: (counts.get(key)?.count || 0) + 1 });
      });
    });
    const tags = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    return { ok: true, tags };
  };

  const searchNotes = async ({ query, folder = '', recursive = true, tags = [], match = 'all', includeContent = true, limit = 50 } = {}) => {
    const q = normalizeOptionalString(query);
    if (!q) return { ok: false, message: 'query is required' };
    let folderRel = '';
    try {
      folderRel = normalizeFolderPath(folder);
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }
    const desiredTags = uniqTags(tags);
    const matchMode = match === 'any' ? 'any' : 'all';
    const max = Number.isFinite(limit) ? Math.max(1, Math.min(200, Math.floor(limit))) : 50;

    const baseList = await listNotes({ folder: folderRel, recursive, tags: desiredTags, match: matchMode, query: '', limit: 500 });
    if (!baseList.ok) return baseList;
    const candidates = Array.isArray(baseList.notes) ? baseList.notes : [];

    const qLower = q.toLowerCase();
    const results = [];
    for (const note of candidates) {
      if (results.length >= max) break;
      const title = normalizeOptionalString(note.title);
      if (title.toLowerCase().includes(qLower)) {
        results.push(note);
        continue;
      }
      const folderName = normalizeOptionalString(note.folder);
      if (folderName.toLowerCase().includes(qLower)) {
        results.push(note);
        continue;
      }
      if (!includeContent) continue;
      try {
        const abs = noteFileAbs(notesRoot, note.folder, note.id);
        const content = await fs.promises.readFile(abs, 'utf8');
        if (String(content || '').toLowerCase().includes(qLower)) {
          results.push(note);
        }
      } catch {
        // ignore
      }
    }
    return { ok: true, notes: results };
  };

  const safe = (fn) => async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return { ok: false, message: err?.message || String(err) };
    }
  };

  return {
    init: safe(init),
    listFolders: safe(listFolders),
    createFolder: safe(createFolder),
    renameFolder: safe(renameFolder),
    deleteFolder: safe(deleteFolder),
    listNotes: safe(listNotes),
    createNote: safe(createNote),
    getNote: safe(getNote),
    updateNote: safe(updateNote),
    deleteNote: safe(deleteNote),
    listTags: safe(listTags),
    searchNotes: safe(searchNotes),
  };
}

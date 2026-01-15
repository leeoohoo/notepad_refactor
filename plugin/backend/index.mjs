import { createNotepadStore } from '../shared/notepad-store.mjs';
import { resolveUiAppDataDir } from '../shared/notepad-paths.mjs';

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveFallbackDataDir(ctx) {
  const pluginId = normalizeString(ctx?.pluginId) || 'com.leeoohoo.notepad';
  return resolveUiAppDataDir({ pluginId });
}

export async function createUiAppsBackend(ctx) {
  const dataDir = normalizeString(ctx?.dataDir) || resolveFallbackDataDir(ctx);
  const store = createNotepadStore({ dataDir });

  return {
    methods: {
      async ping(params, ctx2) {
        return { ok: true, params: params ?? null, pluginId: ctx2?.pluginId || '' };
      },

      async 'notes.init'() {
        return await store.init();
      },

      async 'notes.listFolders'() {
        return await store.listFolders();
      },

      async 'notes.createFolder'(params) {
        return await store.createFolder({ folder: params?.folder });
      },

      async 'notes.renameFolder'(params) {
        return await store.renameFolder({ from: params?.from, to: params?.to });
      },

      async 'notes.deleteFolder'(params) {
        return await store.deleteFolder({ folder: params?.folder, recursive: params?.recursive === true });
      },

      async 'notes.listNotes'(params) {
        return await store.listNotes({
          folder: params?.folder,
          recursive: params?.recursive,
          tags: params?.tags,
          match: params?.match,
          query: params?.query,
          limit: params?.limit,
        });
      },

      async 'notes.createNote'(params) {
        return await store.createNote({
          folder: params?.folder,
          title: params?.title,
          content: params?.content,
          tags: params?.tags,
        });
      },

      async 'notes.getNote'(params) {
        return await store.getNote({ id: params?.id });
      },

      async 'notes.updateNote'(params) {
        return await store.updateNote({
          id: params?.id,
          title: params?.title,
          content: params?.content,
          folder: params?.folder,
          tags: params?.tags,
        });
      },

      async 'notes.deleteNote'(params) {
        return await store.deleteNote({ id: params?.id });
      },

      async 'notes.listTags'() {
        return await store.listTags();
      },

      async 'notes.searchNotes'(params) {
        return await store.searchNotes({
          query: params?.query,
          folder: params?.folder,
          recursive: params?.recursive,
          tags: params?.tags,
          match: params?.match,
          includeContent: params?.includeContent !== false,
          limit: params?.limit,
        });
      },
    },
    async dispose() {},
  };
}

function ensureBridgeAvailable(bridgeEnabled) {
  if (!bridgeEnabled) {
    throw new Error('Host bridge not available (backend.invoke disabled)');
  }
}

export function createNotesApi({ host, bridgeEnabled }) {
  if (!host || typeof host !== 'object') throw new Error('host is required');

  const invoke = async (method, params) => {
    ensureBridgeAvailable(bridgeEnabled);
    return await host.backend.invoke(method, params);
  };

  return {
    init: async () => await invoke('notes.init'),
    listFolders: async () => await invoke('notes.listFolders'),
    createFolder: async (params) => await invoke('notes.createFolder', params),
    renameFolder: async (params) => await invoke('notes.renameFolder', params),
    deleteFolder: async (params) => await invoke('notes.deleteFolder', params),
    listNotes: async (params) => await invoke('notes.listNotes', params),
    createNote: async (params) => await invoke('notes.createNote', params),
    getNote: async (params) => await invoke('notes.getNote', params),
    updateNote: async (params) => await invoke('notes.updateNote', params),
    deleteNote: async (params) => await invoke('notes.deleteNote', params),
    listTags: async () => await invoke('notes.listTags'),
    searchNotes: async (params) => await invoke('notes.searchNotes', params),
  };
}


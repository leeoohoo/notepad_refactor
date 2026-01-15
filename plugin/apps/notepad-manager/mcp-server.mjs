import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createNotepadStore } from '../../shared/notepad-store.mjs';
import { resolveUiAppDataDir } from '../../shared/notepad-paths.mjs';

const PLUGIN_ID = 'com.leeoohoo.notepad';
const SERVER_NAME = 'com.leeoohoo.notepad.manager';

const store = createNotepadStore({ dataDir: resolveUiAppDataDir({ pluginId: PLUGIN_ID }) });

const server = new McpServer({
  name: SERVER_NAME,
  version: '0.1.0',
});

const toText = (payload) => ({
  content: [
    {
      type: 'text',
      text: JSON.stringify(payload, null, 2),
    },
  ],
});

server.registerTool(
  'init',
  {
    title: 'Init Notepad Storage',
    description: 'Initialize the Notepad storage (data directory, index, notes root).',
    inputSchema: z.object({}).optional(),
  },
  async () => toText(await store.init())
);

server.registerTool(
  'list_folders',
  {
    title: 'List Folders',
    description: 'List all folders (categories) under Notepad notes root.',
    inputSchema: z.object({}).optional(),
  },
  async () => toText(await store.listFolders())
);

server.registerTool(
  'create_folder',
  {
    title: 'Create Folder',
    description: 'Create a folder (category). Supports nested paths like "work/ideas".',
    inputSchema: z.object({
      folder: z.string().min(1).describe('Folder path, relative to notes root (e.g., "work/ideas")'),
    }),
  },
  async ({ folder }) => toText(await store.createFolder({ folder }))
);

server.registerTool(
  'rename_folder',
  {
    title: 'Rename Folder',
    description: 'Rename/move a folder (and updates indexed notes folder paths).',
    inputSchema: z.object({
      from: z.string().min(1).describe('Source folder path'),
      to: z.string().min(1).describe('Target folder path'),
    }),
  },
  async ({ from, to }) => toText(await store.renameFolder({ from, to }))
);

server.registerTool(
  'delete_folder',
  {
    title: 'Delete Folder',
    description: 'Delete a folder. If recursive=true, deletes all notes under it and removes them from index.',
    inputSchema: z.object({
      folder: z.string().min(1).describe('Folder path to delete'),
      recursive: z.boolean().optional().describe('Delete folder recursively'),
    }),
  },
  async ({ folder, recursive } = {}) => toText(await store.deleteFolder({ folder, recursive: recursive === true }))
);

server.registerTool(
  'list_notes',
  {
    title: 'List Notes',
    description: 'List notes with optional folder/tags/title filtering.',
    inputSchema: z.object({
      folder: z.string().optional().describe('Folder path; empty means all'),
      recursive: z.boolean().optional().describe('Include notes in subfolders (default true)'),
      tags: z.array(z.string()).optional().describe('Filter notes by tags'),
      match: z.enum(['all', 'any']).optional().describe('Tag match mode'),
      query: z.string().optional().describe('Substring filter for title/folder'),
      limit: z.number().int().min(1).max(500).optional().describe('Max notes to return'),
    }),
  },
  async ({ folder, recursive, tags, match, query, limit } = {}) =>
    toText(await store.listNotes({ folder, recursive, tags, match, query, limit }))
);

server.registerTool(
  'create_note',
  {
    title: 'Create Note',
    description: 'Create a new markdown note under a folder with optional title/content/tags.',
    inputSchema: z.object({
      folder: z.string().optional().describe('Folder path to create note in'),
      title: z.string().optional().describe('Note title'),
      content: z.string().optional().describe('Markdown content (optional)'),
      tags: z.array(z.string()).optional().describe('Tags (optional)'),
    }),
  },
  async ({ folder, title, content, tags } = {}) => toText(await store.createNote({ folder, title, content, tags }))
);

server.registerTool(
  'read_note',
  {
    title: 'Read Note',
    description: 'Read a note by id (returns metadata and markdown content).',
    inputSchema: z.object({
      id: z.string().min(1).describe('Note id'),
    }),
  },
  async ({ id }) => toText(await store.getNote({ id }))
);

server.registerTool(
  'update_note',
  {
    title: 'Update Note',
    description: 'Update note metadata/content by id. You can also move it by changing folder.',
    inputSchema: z.object({
      id: z.string().min(1).describe('Note id'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New markdown content'),
      folder: z.string().optional().describe('New folder path'),
      tags: z.array(z.string()).optional().describe('Replace tags'),
    }),
  },
  async ({ id, title, content, folder, tags } = {}) => toText(await store.updateNote({ id, title, content, folder, tags }))
);

server.registerTool(
  'delete_note',
  {
    title: 'Delete Note',
    description: 'Delete a note by id (removes file and index entry).',
    inputSchema: z.object({
      id: z.string().min(1).describe('Note id'),
    }),
  },
  async ({ id }) => toText(await store.deleteNote({ id }))
);

server.registerTool(
  'list_tags',
  {
    title: 'List Tags',
    description: 'List all tags with usage counts.',
    inputSchema: z.object({}).optional(),
  },
  async () => toText(await store.listTags())
);

server.registerTool(
  'search_notes',
  {
    title: 'Search Notes',
    description: 'Search notes by query, optionally filtered by folder/tags; can include content search.',
    inputSchema: z.object({
      query: z.string().min(1).describe('Search keyword'),
      folder: z.string().optional().describe('Folder path filter'),
      recursive: z.boolean().optional().describe('Include notes in subfolders (default true)'),
      tags: z.array(z.string()).optional().describe('Tag filter'),
      match: z.enum(['all', 'any']).optional().describe('Tag match mode'),
      includeContent: z.boolean().optional().describe('Search in content (default true)'),
      limit: z.number().int().min(1).max(200).optional().describe('Max results'),
    }),
  },
  async ({ query, folder, recursive, tags, match, includeContent, limit } = {}) =>
    toText(await store.searchNotes({ query, folder, recursive, tags, match, includeContent: includeContent !== false, limit }))
);

async function main() {
  const initRes = await store.init();
  if (!initRes?.ok) {
    // eslint-disable-next-line no-console
    console.error('Notepad MCP init failed:', initRes?.message || initRes);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('MCP server error:', error);
  process.exit(1);
});

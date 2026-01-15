# Notepad (Markdown Notes)

This app exposes MCP tools to manage local Markdown notes (folders + tags):

- `mcp_com_leeoohoo_notepad_manager_list_folders`: list folders (categories)
- `mcp_com_leeoohoo_notepad_manager_create_folder`: create a folder (supports nested paths)
- `mcp_com_leeoohoo_notepad_manager_rename_folder`: rename/move a folder
- `mcp_com_leeoohoo_notepad_manager_delete_folder`: delete a folder (optionally recursive)
- `mcp_com_leeoohoo_notepad_manager_list_notes`: list notes filtered by folder/tags/title
- `mcp_com_leeoohoo_notepad_manager_create_note`: create a note (folder/title/content/tags)
- `mcp_com_leeoohoo_notepad_manager_read_note`: read a note (metadata + markdown content)
- `mcp_com_leeoohoo_notepad_manager_update_note`: update a note (title/content/tags/move folder)
- `mcp_com_leeoohoo_notepad_manager_delete_note`: delete a note
- `mcp_com_leeoohoo_notepad_manager_list_tags`: list tags with counts
- `mcp_com_leeoohoo_notepad_manager_search_notes`: search by keyword (optional content search + folder/tags filters)

Guidelines:

1) If you don't know the structure, start with `list_folders` + `list_notes`/`list_tags` before making changes.
2) Ask for confirmation before destructive operations (especially `delete_folder` with `recursive=true`).
3) For quick lookup by folder + tags, prefer `list_notes` (folder+tags) or `search_notes` with filters, instead of scanning everything.


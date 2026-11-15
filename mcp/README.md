# Family Tree MCP server

Lets an AI assistant (Claude Desktop, Claude Code, Cursor, Zed, …) read and edit a `.ftree` file.
It is a single executable: no Node, no install.

## Setup

1. Download the executable for your system from the latest release:
   `family-tree-mcp-macos-arm64`, `family-tree-mcp-macos-x64`, `family-tree-mcp-windows-x64.exe`,
   `family-tree-mcp-linux-x64`, `family-tree-mcp-linux-arm64`.
   On macOS run once `xattr -d com.apple.quarantine <file>` or allow it in System Settings → Privacy & Security.
2. Save your tree to a file in the app (⌘S). Trees that live only in the browser library are not reachable.
3. Add the server to your assistant. Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "family-tree": {
      "command": "/path/to/family-tree-mcp-macos-arm64",
      "args": ["/Users/me/Documents/Family.ftree"]
    }
  }
}
```

Claude Code: `claude mcp add family-tree -- /path/to/family-tree-mcp /path/to/Family.ftree`

Without the path argument the assistant can call `open_tree` with any path (and `create: true` for a new tree).

## While the app is open

Keep the file open in the app: it notices changes on disk within a few seconds and reloads.
If you have unsaved edits in the app it warns instead of reloading; save to overwrite, or reopen to take the assistant's version.

## Tools

`open_tree`, `tree_summary`, `tree_outline`, `list_people`, `get_person`, `add_person`, `update_person`,
`add_relative` (parent, child, sibling, spouse), `link_people` (spouse, child_of, parent_of), `set_marriage`,
`set_child_kind` (adopted, foster, twins, order), `add_relation` (emotional lines, household), `remove_person`,
`set_index_person`.

Every writing tool accepts `dryRun: true` to preview and refuses to write if the file changed on disk since it was read
(`force: true` overrides). Writes go through a temporary file and an atomic rename. People can be referenced by id or by
a unique exact name.

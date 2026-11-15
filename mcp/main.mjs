#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.mjs';
import { Store } from './store.mjs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`family-tree-mcp [path/to/tree.ftree]

MCP server (stdio) that lets an AI assistant read and edit a family tree file.
Pass the file path as an argument, or let the assistant call open_tree.`);
  process.exit(0);
}
const store = new Store();
const path = args.find((a) => !a.startsWith('-'));
if (path) {
  try {
    await store.open(path);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error(`Cannot open ${path}: ${e.message}`);
      process.exit(1);
    }
    await store.create(path);
  }
}
const server = createServer(store);
await server.connect(new StdioServerTransport());

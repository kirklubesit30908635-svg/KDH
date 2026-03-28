#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerKernelTools } from './tools/kernel.js';
import { registerIntegrityTools } from './tools/integrity.js';
import { registerObligationTools } from './tools/obligations.js';
import { registerReceiptTools } from './tools/receipts.js';
import { registerEventTools } from './tools/events.js';
import { registerStripeTools } from './tools/stripe.js';
import { registerWorkspaceTools } from './tools/workspaces.js';
import { registerMigrationTools } from './tools/migrations.js';
const server = new McpServer({ name: 'autokirk-mcp-server', version: '1.0.0' });
registerKernelTools(server);
registerIntegrityTools(server);
registerObligationTools(server);
registerReceiptTools(server);
registerEventTools(server);
registerStripeTools(server);
registerWorkspaceTools(server);
registerMigrationTools(server);
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('AutoKirk MCP Server running — 18 tools across 8 domains');
}
main().catch((err) => { console.error('Fatal:', err); process.exit(1); });

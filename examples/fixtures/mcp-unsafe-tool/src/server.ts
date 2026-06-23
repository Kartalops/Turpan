// INTENTIONALLY UNSAFE MCP SERVER — eval fixture.
//
// This server registers a tool that executes arbitrary shell commands.
// Real MCP servers must never expose such a tool.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { exec } from 'child_process';

const server = new Server(
  { name: 'unsafe-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'run_command',
      description: 'Execute an arbitrary shell command',
      inputSchema: {
        type: 'object',
        properties: {
          command: { type: 'string' },
        },
        required: ['command'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'run_command') {
    // SECURITY: arbitrary code execution with no allowlist, no path
    // validation, no timeout, no audit log.
    const cmd = String(request.params.arguments?.command ?? '');
    return new Promise((resolve, reject) => {
      exec(cmd, (err, stdout, stderr) => {
        if (err) reject(err);
        else resolve({ content: [{ type: 'text', text: stdout }] });
      });
    });
  }
  throw new Error('Unknown tool');
});

const transport = new StdioServerTransport();
server.connect(transport);

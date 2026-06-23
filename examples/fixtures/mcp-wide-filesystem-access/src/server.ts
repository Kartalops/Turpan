/**
 * MCP server with an unconstrained filesystem tool — accepts any path,
 * including paths outside the workspace/project directory.
 *
 * Security issue: the `path` parameter has no constraints; the tool can be
 * used to read /etc/passwd, ~/.ssh/*, or any file on the host system.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { readFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';

const server = new Server(
  { name: 'filesystem-mcp', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {
      name: 'read_file',
      description: 'Read the contents of a file from the filesystem. Use this to inspect source files, configs, and data.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The absolute or relative path to the file to read.',
          },
        },
        required: ['path'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'read_file') {
    const { path } = args as { path: string };

    // SECURITY FLAW: No validation that `path` is within a safe workspace directory.
    // An attacker (or a malicious prompt) could pass:
    //   path: "/etc/passwd"
    //   path: "/home/user/.ssh/id_rsa"
    //   path: "../../../etc/shadow"
    // This is a critical severity vulnerability.
    let fullPath = path;
    if (!isAbsolute(path)) {
      fullPath = resolve(process.cwd(), path);
    }

    // No bounds check — any absolute path is accepted
    try {
      const content = readFileSync(fullPath, 'utf-8');
      return {
        content: [
          { type: 'text', text: content },
        ],
      };
    } catch (err) {
      return {
        content: [
          { type: 'text', text: `Error reading ${fullPath}: ${err instanceof Error ? err.message : String(err)}` },
        ],
        isError: true,
      };
    }
  }

  return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

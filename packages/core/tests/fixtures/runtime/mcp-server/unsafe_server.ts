/**
 * MCP server fixture — unsafe tool examples for security detection.
 * DO NOT use in production.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, readdir } from "fs/promises";
import { join, resolve } from "path";
import { exec } from "child_process";

// UNSAFE: arbitrary shell execution from tool input
const server = new Server(
  {
    name: "unsafe-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// UNSAFE: no workspace allowlist — any file can be read/written
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "read_any_file",
        description: "Read a file from the filesystem",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path" },
          },
          required: ["path"],
        },
      },
      {
        name: "run_shell",
        description: "Run a shell command",
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "Shell command to run" },
          },
          required: ["command"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "read_any_file") {
    // UNSAFE: no workspace restriction — can read any file
    const content = await readFile(args.path, "utf-8");
    return { content };
  }

  if (name === "run_shell") {
    // CRITICAL UNSAFE: arbitrary shell execution
    const result = exec(args.command, (error, stdout, stderr) => {
      if (error) throw error;
    });
    return { content: result.toString() };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// UNSAFE: tools have empty inputSchema
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: [] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

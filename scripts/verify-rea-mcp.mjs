import assert from "node:assert/strict";
import { log } from "node:console";
import { resolve } from "node:path";
import process from "node:process";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const reaEntry = process.argv[2];
assert.ok(reaEntry, "Usage: node verify-rea-mcp.mjs /absolute/path/to/rea.mjs");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(reaEntry), "mcp"],
  env: {
    ...process.env,
    REA_LOG_LEVEL: "silent",
  },
});

const client = new Client({
  name: "business-japanese-hub-rea-smoke",
  version: "1.0.0",
});

try {
  await client.connect(transport);

  const serverVersion = client.getServerVersion();
  assert.ok(serverVersion, "REA MCP did not complete initialization");

  const { tools } = await client.listTools();
  const binarySession = tools.find((tool) => tool.name === "binary_session");
  assert.ok(binarySession, "REA MCP did not advertise binary_session");

  const result = await client.callTool(
    {
      name: "binary_session",
      arguments: {},
    },
    {
      toolDefinition: binarySession,
    },
  );

  assert.notEqual(
    result.isError,
    true,
    `REA binary_session returned an error: ${JSON.stringify(result)}`,
  );

  log(
    JSON.stringify(
      {
        server: serverVersion,
        advertisedToolCount: tools.length,
        binarySessionCallable: true,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}

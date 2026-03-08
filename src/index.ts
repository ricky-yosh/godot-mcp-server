#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerSceneTools } from "./tools/scene-tools.js";
import { registerScriptTools } from "./tools/script-tools.js";
import { registerAssetTools } from "./tools/asset-tools.js";
import { GODOT_BASE_URL } from "./constants.js";

const server = new McpServer({
  name: "godot-mcp-server",
  version: "1.0.0"
});

registerSceneTools(server);
registerScriptTools(server);
registerAssetTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Godot MCP Server started. Connecting to Godot at: ${GODOT_BASE_URL}`);
}

main().catch((error: unknown) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { godotRequest } from "../services/godot-client.js";
import { GodotResourceInfo } from "../types.js";
import { CHARACTER_LIMIT } from "../constants.js";

export function registerAssetTools(server: McpServer): void {

  // ── List filesystem ─────────────────────────────────────────────────────
  server.registerTool(
    "godot_list_files",
    {
      title: "List Project Files",
      description: `Lists files in the Godot project filesystem under a given directory.

Args:
  - directory (string, optional): res:// directory path (default: "res://")
  - filter_type (string, optional): Filter by extension e.g. "tscn", "gd", "png", "tres". Omit for all.
  - recursive (boolean, optional): Include subdirectories (default: false)
  - limit (number, optional): Max results (default: 50, max: 200)
  - offset (number, optional): Pagination offset (default: 0)

Returns:
  { total, count, offset, has_more, items: [{ path, type, name }] }`,
      inputSchema: z.object({
        directory: z.string().default("res://").describe("Directory to list"),
        filter_type: z.string().optional().describe("File extension filter e.g. 'tscn'"),
        recursive: z.boolean().default(false).describe("Include subdirectories"),
        limit: z.number().int().min(1).max(200).default(50).describe("Max results"),
        offset: z.number().int().min(0).default(0).describe("Pagination offset")
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ directory, filter_type, recursive, limit, offset }) => {
      const result = await godotRequest<{
        total: number; count: number; offset: number;
        has_more: boolean; items: GodotResourceInfo[];
      }>("GET", "/filesystem/list", { directory, filter_type, recursive, limit, offset });

      const text = JSON.stringify(result, null, 2);
      return {
        content: [{ type: "text", text: text.length > CHARACTER_LIMIT ? text.slice(0, CHARACTER_LIMIT) + "\n... (truncated)" : text }]
      };
    }
  );

  // ── Get resource info ───────────────────────────────────────────────────
  server.registerTool(
    "godot_get_resource",
    {
      title: "Get Resource Info",
      description: `Returns metadata about a specific resource file (texture, audio, mesh, etc.).

Args:
  - resource_path (string): res:// path to the resource e.g. "res://assets/player.png"

Returns:
  { path, type, name, metadata: object }`,
      inputSchema: z.object({
        resource_path: z.string().describe("res:// path to the resource")
      }).strict(),
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ resource_path }) => {
      const info = await godotRequest<GodotResourceInfo & { metadata: unknown }>(
        "GET", "/filesystem/resource", { resource_path }
      );
      return {
        content: [{ type: "text", text: JSON.stringify(info, null, 2) }]
      };
    }
  );

  // ── Assign resource to node property ───────────────────────────────────
  server.registerTool(
    "godot_assign_resource",
    {
      title: "Assign Resource to Node Property",
      description: `Loads a resource and assigns it to a property of a node. 
Useful for setting textures, materials, audio streams, etc.

Args:
  - node_path (string): Node path e.g. "/root/Main/Player/Sprite2D"
  - property (string): Property name e.g. "texture", "material", "stream"
  - resource_path (string): res:// path to the resource to assign
  - scene_path (string, optional): Scene to modify. Defaults to active scene.

Returns:
  Confirmation of the assignment.

Examples:
  - Use when: "Set the player sprite texture to res://assets/player.png"
    -> node_path: "/root/Main/Player/Sprite2D", property: "texture",
       resource_path: "res://assets/player.png"`,
      inputSchema: z.object({
        node_path: z.string().describe("Target node path"),
        property: z.string().describe("Property to set the resource on"),
        resource_path: z.string().describe("res:// path to the resource"),
        scene_path: z.string().optional().describe("Scene to modify. Omit for active scene.")
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    },
    async ({ node_path, property, resource_path, scene_path }) => {
      await godotRequest<void>("POST", "/filesystem/assign-resource", {
        node_path, property, resource_path, scene_path
      });
      return {
        content: [{
          type: "text",
          text: `Assigned ${resource_path} to ${node_path}.${property}`
        }]
      };
    }
  );

  // ── Create new scene file ───────────────────────────────────────────────
  server.registerTool(
    "godot_create_scene",
    {
      title: "Create New Scene File",
      description: `Creates a new empty scene file (.tscn) with a specified root node type.

Args:
  - scene_path (string): res:// path for the new scene e.g. "res://levels/level2.tscn"
  - root_type (string): Godot class for the root node e.g. "Node2D", "Node3D", "Control", "CharacterBody2D"
  - root_name (string, optional): Name for the root node (defaults to the scene file stem)
  - open_in_editor (boolean, optional): Open the new scene in the editor (default: true)

Returns:
  { path, root_node, root_type } of the created scene.`,
      inputSchema: z.object({
        scene_path: z.string().describe("res:// destination path for the new .tscn"),
        root_type: z.string().describe("Godot class name for the root node"),
        root_name: z.string().optional().describe("Name for the root node"),
        open_in_editor: z.boolean().default(true).describe("Open in editor after creation")
      }).strict(),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    },
    async ({ scene_path, root_type, root_name, open_in_editor }) => {
      const result = await godotRequest<{ path: string; root_node: string; root_type: string }>(
        "POST", "/scenes/create", { scene_path, root_type, root_name, open_in_editor }
      );
      return {
        content: [{ type: "text", text: `Scene created: ${JSON.stringify(result, null, 2)}` }]
      };
    }
  );
}

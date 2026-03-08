import { z } from "zod";
import { godotRequest } from "../services/godotClient.js";
const ASSET_TYPES = ["texture", "scene", "audio", "font", "material", "mesh", "shader", "all"];
export function registerAssetTools(server) {
    // ── List Assets ─────────────────────────────────────────────────────────────
    server.registerTool("godot_list_assets", {
        title: "List Project Assets",
        description: `Lists assets (files) in the Godot project's res:// filesystem.

Args:
  - type ("texture" | "scene" | "audio" | "font" | "material" | "mesh" | "shader" | "all"):
      Filter by asset type. Default "all".
  - path_filter (string, optional): Only list assets under this folder e.g. "res://assets/"
  - limit (number): Max results (default 50)
  - offset (number): Pagination offset (default 0)

Returns:
  {
    "assets": [{ "path": string, "type": string, "size_bytes": number }],
    "total": number,
    "has_more": boolean,
    "next_offset": number
  }

Examples:
  - List all textures to find available sprites
  - List all .tscn scenes to find instantiatable prefabs`,
        inputSchema: z.object({
            type: z.enum(ASSET_TYPES).default("all").describe("Asset type filter"),
            path_filter: z.string().optional().describe("Filter under this res:// directory"),
            limit: z.number().int().min(1).max(200).default(50).describe("Max results"),
            offset: z.number().int().min(0).default(0).describe("Pagination offset")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ type, path_filter, limit, offset }) => {
        try {
            const params = new URLSearchParams({ type, limit: String(limit), offset: String(offset) });
            if (path_filter)
                params.set("path_filter", path_filter);
            const data = await godotRequest("GET", `/assets/list?${params.toString()}`);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Get Asset Info ──────────────────────────────────────────────────────────
    server.registerTool("godot_get_asset_info", {
        title: "Get Asset Info",
        description: `Returns metadata about a specific asset file in the project.

Args:
  - asset_path (string): Resource path e.g. "res://assets/sprites/player.png"

Returns type, file size, and any import settings associated with the asset.`,
        inputSchema: z.object({
            asset_path: z.string().startsWith("res://").describe("Resource path to the asset")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ asset_path }) => {
        try {
            const data = await godotRequest("GET", `/assets/info?path=${encodeURIComponent(asset_path)}`);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Set Node Texture ────────────────────────────────────────────────────────
    server.registerTool("godot_set_node_texture", {
        title: "Set Texture on Sprite Node",
        description: `Convenience tool: loads a texture asset and assigns it to a Sprite2D or TextureRect node.

Args:
  - node_path (string): NodePath of the Sprite2D or TextureRect node
  - texture_path (string): Resource path to a texture file e.g. "res://assets/player.png"

This is equivalent to calling godot_set_node_property with property="texture",
but handles the resource loading automatically.`,
        inputSchema: z.object({
            node_path: z.string().min(1).describe("NodePath of the Sprite2D or TextureRect node"),
            texture_path: z.string().startsWith("res://").describe("Resource path to texture file")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ node_path, texture_path }) => {
        try {
            await godotRequest("POST", "/assets/set_texture", { node_path, texture_path });
            return { content: [{ type: "text", text: `Texture '${texture_path}' applied to '${node_path}'` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Get Project Info ────────────────────────────────────────────────────────
    server.registerTool("godot_get_project_info", {
        title: "Get Godot Project Info",
        description: `Returns metadata about the open Godot project including name, version, and settings.

No arguments required.

Returns:
  {
    "name": string,           // project.godot display name
    "godot_version": string,  // Godot engine version e.g. "4.3"
    "main_scene": string,     // res:// path to main scene
    "project_path": string    // Absolute filesystem path to the project root
  }`,
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async () => {
        try {
            const data = await godotRequest("GET", "/project/info");
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
}
//# sourceMappingURL=assetTools.js.map
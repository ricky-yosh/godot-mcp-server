// ============================================================
// File / Asset Tools — browse project files, manage resources
// ============================================================
import { z } from "zod";
import { godotClient } from "../services/godot-client.js";
import { okJson, errResult } from "../services/helpers.js";
export function registerFileTools(server) {
    // ── List files ────────────────────────────────────────────
    server.registerTool("godot_fs_list", {
        title: "List Project Files",
        description: `Lists files and directories under a given path in the Godot project.
Use 'res://' for the project root. Supports optional type filtering.

Returns: Array of { path, type ('file'|'directory'), size? }`,
        inputSchema: z.object({
            directory: z.string().default("res://").describe("Res:// path to list, e.g. 'res://scenes'"),
            extensions: z.array(z.string()).optional().describe("Filter by extension e.g. ['.gd', '.tscn']"),
            recursive: z.boolean().default(false).describe("Whether to recurse into subdirectories"),
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ directory, extensions, recursive }) => {
        try {
            const result = await godotClient.send("fs_list", { directory, extensions, recursive });
            return okJson(result);
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    // ── Read file (raw text) ──────────────────────────────────
    server.registerTool("godot_fs_read_file", {
        title: "Read Project File",
        description: "Reads any text file from the project (e.g. .gd, .tscn, .tres, .json, .cfg).",
        inputSchema: z.object({
            file_path: z.string().describe("Res:// path, e.g. 'res://data/config.json'"),
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ file_path }) => {
        try {
            const result = await godotClient.send("fs_read_file", { file_path });
            return okJson(result);
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    // ── Write file (raw text) ─────────────────────────────────
    server.registerTool("godot_fs_write_file", {
        title: "Write Project File",
        description: "Writes raw text content to any file in the project. Creates parent directories if needed.",
        inputSchema: z.object({
            file_path: z.string().describe("Res:// path"),
            content: z.string().describe("Text content to write"),
        }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }, async ({ file_path, content }) => {
        try {
            const result = await godotClient.send("fs_write_file", { file_path, content });
            return okJson(result);
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    // ── Delete file ───────────────────────────────────────────
    server.registerTool("godot_fs_delete_file", {
        title: "Delete Project File",
        description: "Permanently deletes a file from the project. Use with caution.",
        inputSchema: z.object({
            file_path: z.string().describe("Res:// path of the file to delete"),
        }),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }, async ({ file_path }) => {
        try {
            await godotClient.send("fs_delete_file", { file_path });
            return okJson({ deleted: file_path });
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    // ── List resources by type ────────────────────────────────
    server.registerTool("godot_fs_find_resources", {
        title: "Find Resources by Type",
        description: `Searches the project for resources matching a given Godot class type.
Useful for finding all textures, audio streams, tilemaps, etc.

Returns: Array of { path, type, uid }`,
        inputSchema: z.object({
            resource_type: z.string().describe("Godot class name e.g. 'Texture2D', 'AudioStream', 'PackedScene'"),
            directory: z.string().default("res://").describe("Root directory to search"),
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ resource_type, directory }) => {
        try {
            const result = await godotClient.send("fs_find_resources", { resource_type, directory });
            return okJson(result);
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    // ── Get project settings ──────────────────────────────────
    server.registerTool("godot_project_get_setting", {
        title: "Get Project Setting",
        description: "Reads a setting from ProjectSettings. E.g. 'application/config/name', 'physics/2d/gravity'.",
        inputSchema: z.object({
            setting_path: z.string().describe("Dot-separated setting path"),
        }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ setting_path }) => {
        try {
            const result = await godotClient.send("project_get_setting", { setting_path });
            return okJson({ setting: setting_path, value: result });
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    // ── Set project setting ───────────────────────────────────
    server.registerTool("godot_project_set_setting", {
        title: "Set Project Setting",
        description: "Writes a value to ProjectSettings and saves the project.godot file.",
        inputSchema: z.object({
            setting_path: z.string().describe("Dot-separated setting path"),
            value: z.unknown().describe("New value"),
        }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ setting_path, value }) => {
        try {
            await godotClient.send("project_set_setting", { setting_path, value });
            return okJson({ setting: setting_path, value });
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
}
//# sourceMappingURL=file-tools.js.map
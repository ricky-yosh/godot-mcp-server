import { z } from "zod";
import { godotRequest } from "../services/godotClient.js";
import { CHARACTER_LIMIT } from "../constants.js";
export function registerScriptTools(server) {
    // ── List Scripts ────────────────────────────────────────────────────────────
    server.registerTool("godot_list_scripts", {
        title: "List GDScript Files",
        description: `Lists all .gd script files in the Godot project.

Args:
  - path_filter (string, optional): Only include scripts under this directory e.g. "res://scripts/"
  - limit (number, optional): Max results (default 50)
  - offset (number, optional): Pagination offset (default 0)

Returns a list of { path, class_name } objects.`,
        inputSchema: z.object({
            path_filter: z.string().optional().describe("Filter scripts under this res:// path"),
            limit: z.number().int().min(1).max(200).default(50).describe("Max results"),
            offset: z.number().int().min(0).default(0).describe("Pagination offset")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ path_filter, limit, offset }) => {
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (path_filter)
                params.set("path_filter", path_filter);
            const data = await godotRequest("GET", `/scripts/list?${params.toString()}`);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Read Script ─────────────────────────────────────────────────────────────
    server.registerTool("godot_read_script", {
        title: "Read GDScript File",
        description: `Returns the full source code of a GDScript file.

Args:
  - script_path (string): Resource path e.g. "res://scripts/player.gd"

Returns: { path, content, class_name, base_class }`,
        inputSchema: z.object({
            script_path: z.string().startsWith("res://").describe("Resource path to the .gd file")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ script_path }) => {
        try {
            const data = await godotRequest("GET", `/scripts/read?path=${encodeURIComponent(script_path)}`);
            const text = data.content.length > CHARACTER_LIMIT
                ? data.content.slice(0, CHARACTER_LIMIT) + `\n\n[...truncated at ${CHARACTER_LIMIT} chars]`
                : data.content;
            return { content: [{ type: "text", text: text }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Write Script ────────────────────────────────────────────────────────────
    server.registerTool("godot_write_script", {
        title: "Write GDScript File",
        description: `Creates or overwrites a GDScript file at the given resource path.

Args:
  - script_path (string): Resource path e.g. "res://scripts/enemy.gd"
  - content (string): Full GDScript source code

Creates the file if it doesn't exist. Overwrites if it does.
The script will be immediately available for attachment to nodes.

Examples:
  - Write a new player controller script
  - Update an existing script with new logic`,
        inputSchema: z.object({
            script_path: z.string().startsWith("res://").endsWith(".gd").describe("Resource path for the script"),
            content: z.string().min(1).describe("Full GDScript source code")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ script_path, content }) => {
        try {
            await godotRequest("POST", "/scripts/write", { script_path, content });
            return { content: [{ type: "text", text: `Script written: ${script_path}` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Attach Script to Node ───────────────────────────────────────────────────
    server.registerTool("godot_attach_script", {
        title: "Attach Script to Node",
        description: `Attaches an existing GDScript file to a node in the current scene.

Args:
  - node_path (string): NodePath of the target node e.g. "Player"
  - script_path (string): Resource path to the script e.g. "res://scripts/player.gd"

The script must already exist. Use godot_write_script first if needed.`,
        inputSchema: z.object({
            node_path: z.string().min(1).describe("NodePath of the node"),
            script_path: z.string().startsWith("res://").endsWith(".gd").describe("Resource path to .gd file")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ node_path, script_path }) => {
        try {
            await godotRequest("POST", "/scripts/attach", { node_path, script_path });
            return { content: [{ type: "text", text: `Script '${script_path}' attached to '${node_path}'` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Run GDScript ────────────────────────────────────────────────────────────
    server.registerTool("godot_run_script", {
        title: "Execute GDScript Code",
        description: `Executes an arbitrary snippet of GDScript code in the Godot editor context.

Args:
  - code (string): GDScript code to execute. Has access to EditorInterface and the scene tree.
  - context ("editor" | "game"): Where to run the code. Default "editor".

Returns stdout output and any errors.

Examples:
  - Print a list of all nodes: "print(get_tree().get_nodes_in_group('enemies'))"
  - Run a utility function to batch-rename nodes
  - Test a calculation before embedding in a script

Security note: Only use with code you trust. Runs with full editor privileges.`,
        inputSchema: z.object({
            code: z.string().min(1).describe("GDScript code to execute"),
            context: z.enum(["editor", "game"]).default("editor").describe("Execution context")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    }, async ({ code, context }) => {
        try {
            const data = await godotRequest("POST", "/scripts/run", { code, context });
            const lines = [];
            if (data.output)
                lines.push(`Output:\n${data.output}`);
            if (data.error)
                lines.push(`Error:\n${data.error}`);
            if (lines.length === 0)
                lines.push("Script executed successfully (no output).");
            return { content: [{ type: "text", text: lines.join("\n\n") }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
}
//# sourceMappingURL=scriptTools.js.map
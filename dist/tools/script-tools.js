import { z } from "zod";
import { godotRequest } from "../services/godot-client.js";
export function registerScriptTools(server) {
    // ── Read GDScript file ──────────────────────────────────────────────────
    server.registerTool("godot_read_script", {
        title: "Read GDScript File",
        description: `Reads the content of a GDScript (.gd) or other text-based resource file.

Args:
  - file_path (string): res:// path e.g. "res://player/player.gd"

Returns:
  { path: string, content: string }`,
        inputSchema: z.object({
            file_path: z.string().describe("res:// path to the script file")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ file_path }) => {
        const file = await godotRequest("GET", "/filesystem/file", { file_path });
        return {
            content: [{ type: "text", text: file.content }]
        };
    });
    // ── Write GDScript file ─────────────────────────────────────────────────
    server.registerTool("godot_write_script", {
        title: "Write GDScript File",
        description: `Writes (creates or overwrites) a GDScript file at the given path.

Args:
  - file_path (string): res:// path e.g. "res://player/player.gd"
  - content (string): Full GDScript source code to write.

Returns:
  Confirmation with the file path.

Examples:
  - Use when: "Create a new movement script for the Player"`,
        inputSchema: z.object({
            file_path: z.string().describe("res:// path for the script"),
            content: z.string().describe("Full GDScript source code")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ file_path, content }) => {
        await godotRequest("POST", "/filesystem/file", { file_path, content });
        return {
            content: [{ type: "text", text: `Script written to: ${file_path}` }]
        };
    });
    // ── Run GDScript ────────────────────────────────────────────────────────
    server.registerTool("godot_run_script", {
        title: "Run GDScript Expression",
        description: `Executes a GDScript expression or block in the Godot editor context (via EditorScript).
Useful for querying engine state or performing quick operations.

Args:
  - code (string): GDScript code to execute. Should be a valid expression or a series of statements.
    Has access to: Engine, ProjectSettings, EditorInterface (in editor context).
  - timeout_ms (number, optional): Max execution time in milliseconds (default: 5000, max: 30000).

Returns:
  { success: boolean, output: string, error?: string }

Examples:
  - Use when: "What is the current project name?"
    -> code: "ProjectSettings.get_setting('application/config/name')"
  - Use when: "List all files in res://levels/"
    -> code: "DirAccess.get_files_at('res://levels/')"

Warning: This runs arbitrary code in the editor. Use with care.`,
        inputSchema: z.object({
            code: z.string().describe("GDScript code to execute"),
            timeout_ms: z.number().int().min(100).max(30_000).default(5_000).describe("Execution timeout in ms")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    }, async ({ code, timeout_ms }) => {
        const result = await godotRequest("POST", "/script/run", { code, timeout_ms });
        const text = result.success
            ? `Output:\n${result.output}`
            : `Error:\n${result.error}\nOutput:\n${result.output}`;
        return {
            content: [{ type: "text", text }]
        };
    });
}
//# sourceMappingURL=script-tools.js.map
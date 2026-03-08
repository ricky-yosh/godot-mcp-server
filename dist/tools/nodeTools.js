"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerNodeTools = registerNodeTools;
const zod_1 = require("zod");
const godotClient_js_1 = require("../services/godotClient.js");
const errors_js_1 = require("../services/errors.js");
const constants_js_1 = require("../constants.js");
function registerNodeTools(server) {
    // ── Get scene tree ─────────────────────────────────────────────────────────
    server.registerTool("godot_get_scene_tree", {
        title: "Get Scene Tree",
        description: `Returns the full scene tree of the currently open scene as a nested JSON structure.
Each node includes its name, type, node path, and children.

Args:
  - include_properties (boolean): If true, also include exported properties for each node (default: false).
    Set to false for large scenes to keep the response manageable.
  - root_path (string, optional): Limit tree to a subtree starting at this node path (e.g. "/root/Player").

Returns:
  Nested NodeInfo objects: { name, type, path, children, properties? }

Errors:
  - "No scene open" if editor has no active scene`,
        inputSchema: zod_1.z.object({
            include_properties: zod_1.z.boolean()
                .default(false)
                .describe("Include exported node properties in the result"),
            root_path: zod_1.z.string()
                .optional()
                .describe('Limit to subtree at this path, e.g. "/root/Player". Omit for full tree.')
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ include_properties, root_path }) => {
        try {
            const data = await godotClient_js_1.godotClient.send("get_scene_tree", {
                include_properties,
                root_path: root_path ?? null
            });
            const text = JSON.stringify(data, null, 2);
            if (text.length > constants_js_1.CHARACTER_LIMIT) {
                return (0, errors_js_1.toolOk)(text.slice(0, constants_js_1.CHARACTER_LIMIT) +
                    `\n\n[TRUNCATED — response exceeded ${constants_js_1.CHARACTER_LIMIT} chars. ` +
                    `Use root_path to narrow the subtree, or set include_properties=false.]`);
            }
            return (0, errors_js_1.toolOk)(text);
        }
        catch (e) {
            return (0, errors_js_1.toolError)(e);
        }
    });
    // ── Get node properties ────────────────────────────────────────────────────
    server.registerTool("godot_get_node_properties", {
        title: "Get Node Properties",
        description: `Returns all exported properties of a specific node in the current scene.

Args:
  - node_path (string): Absolute scene-tree path, e.g. "/root/Main/Player"

Returns:
  { node_path, type, properties: { [key]: value } }

Errors:
  - "Node not found: ..." if the path is invalid`,
        inputSchema: zod_1.z.object({
            node_path: zod_1.z.string()
                .min(1)
                .describe('Absolute node path, e.g. "/root/Main/Player"')
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ node_path }) => {
        try {
            const data = await godotClient_js_1.godotClient.send("get_node_properties", { node_path });
            return (0, errors_js_1.toolOk)(JSON.stringify(data, null, 2));
        }
        catch (e) {
            return (0, errors_js_1.toolError)(e);
        }
    });
    // ── Set node property ──────────────────────────────────────────────────────
    server.registerTool("godot_set_node_property", {
        title: "Set Node Property",
        description: `Sets a single property on a node in the current scene at runtime.
Changes are live immediately but won't persist until you call godot_save_scene.

Args:
  - node_path (string): Absolute path, e.g. "/root/Main/Player"
  - property (string): Property name, e.g. "position", "visible", "speed"
  - value (any): New value. Use JSON-compatible types. Vectors as [x,y] or [x,y,z] arrays.

Returns: "Set /root/Main/Player.position = [100, 200]"

Errors:
  - "Node not found" / "Property not found"`,
        inputSchema: zod_1.z.object({
            node_path: zod_1.z.string().min(1).describe("Absolute node path"),
            property: zod_1.z.string().min(1).describe("Property name to set"),
            value: zod_1.z.unknown().describe("New value (JSON-compatible)")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async ({ node_path, property, value }) => {
        try {
            await godotClient_js_1.godotClient.send("set_node_property", { node_path, property, value });
            return (0, errors_js_1.toolOk)(`Set ${node_path}.${property} = ${JSON.stringify(value)}`);
        }
        catch (e) {
            return (0, errors_js_1.toolError)(e);
        }
    });
    // ── Spawn node ────────────────────────────────────────────────────────────
    server.registerTool("godot_spawn_node", {
        title: "Spawn Node",
        description: `Creates a new node of a given type and adds it as a child of the specified parent.
Changes are live immediately. Call godot_save_scene to persist.

Args:
  - parent_path (string): Path of the parent node, e.g. "/root/Main"
  - node_type (string): Godot class name, e.g. "Sprite2D", "CharacterBody2D", "Label"
  - node_name (string): Name for the new node
  - properties (object, optional): Initial property values to set after creation

Returns: "Spawned Sprite2D 'Enemy' at /root/Main/Enemy"

Errors:
  - "Unknown type: ..." if the class name is invalid`,
        inputSchema: zod_1.z.object({
            parent_path: zod_1.z.string().min(1).describe("Absolute path of the parent node"),
            node_type: zod_1.z.string().min(1).describe('Godot class, e.g. "Sprite2D", "Label"'),
            node_name: zod_1.z.string().min(1).describe("Name for the new node"),
            properties: zod_1.z.record(zod_1.z.unknown()).optional().describe("Optional initial properties to set")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async ({ parent_path, node_type, node_name, properties }) => {
        try {
            const data = await godotClient_js_1.godotClient.send("spawn_node", {
                parent_path, node_type, node_name, properties: properties ?? {}
            });
            return (0, errors_js_1.toolOk)(`Spawned ${node_type} '${node_name}' at ${data.path}`);
        }
        catch (e) {
            return (0, errors_js_1.toolError)(e);
        }
    });
    // ── Remove node ───────────────────────────────────────────────────────────
    server.registerTool("godot_remove_node", {
        title: "Remove Node",
        description: `Removes (frees) a node and all its children from the current scene.
This is destructive. Call godot_save_scene afterwards to persist.

Args:
  - node_path (string): Absolute path of the node to remove, e.g. "/root/Main/Enemy"

Returns: "Removed node: /root/Main/Enemy"

Errors:
  - "Node not found" if the path doesn't exist
  - "Cannot remove root node" if you target /root`,
        inputSchema: zod_1.z.object({
            node_path: zod_1.z.string().min(1).describe("Absolute path of the node to remove")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    }, async ({ node_path }) => {
        try {
            await godotClient_js_1.godotClient.send("remove_node", { node_path });
            return (0, errors_js_1.toolOk)(`Removed node: ${node_path}`);
        }
        catch (e) {
            return (0, errors_js_1.toolError)(e);
        }
    });
    // ── Call node method ──────────────────────────────────────────────────────
    server.registerTool("godot_call_node_method", {
        title: "Call Node Method",
        description: `Calls a method on a node in the current scene and returns the result.
Useful for triggering game logic, animations, or signals.

Args:
  - node_path (string): Absolute node path
  - method (string): Method name, e.g. "play", "stop", "emit_signal"
  - args (array, optional): Positional arguments to pass to the method

Returns: The method's return value serialized as JSON, or "null" if void.`,
        inputSchema: zod_1.z.object({
            node_path: zod_1.z.string().min(1).describe("Absolute node path"),
            method: zod_1.z.string().min(1).describe("Method name to call"),
            args: zod_1.z.array(zod_1.z.unknown()).default([]).describe("Positional arguments")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async ({ node_path, method, args }) => {
        try {
            const result = await godotClient_js_1.godotClient.send("call_node_method", { node_path, method, args });
            return (0, errors_js_1.toolOk)(JSON.stringify(result, null, 2));
        }
        catch (e) {
            return (0, errors_js_1.toolError)(e);
        }
    });
}
//# sourceMappingURL=nodeTools.js.map
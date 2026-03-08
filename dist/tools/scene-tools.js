import { z } from "zod";
import { godotRequest } from "../services/godot-client.js";
export function registerSceneTools(server) {
    // ── List open scenes ────────────────────────────────────────────────────
    server.registerTool("godot_list_scenes", {
        title: "List Open Scenes",
        description: `Returns all scenes currently open in the Godot editor, including the active scene.

Returns:
  Array of scene objects:
  { path: string, root_node: string, root_type: string, node_count: number }

Examples:
  - Use when: "What scenes are open?" or "List all scenes"`,
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async () => {
        const scenes = await godotRequest("GET", "/scenes");
        return {
            content: [{ type: "text", text: JSON.stringify(scenes, null, 2) }]
        };
    });
    // ── Get scene tree ──────────────────────────────────────────────────────
    server.registerTool("godot_get_scene_tree", {
        title: "Get Scene Tree",
        description: `Returns the full node hierarchy of the specified scene (or the currently active scene if no path given).

Args:
  - scene_path (string, optional): Path to the scene file e.g. "res://levels/main.tscn". Defaults to the active scene.
  - depth (number, optional): Maximum recursion depth (default: 10, max: 50).

Returns:
  Nested node tree: { name, type, path, children[], properties? }

Examples:
  - Use when: "Show me the scene tree" or "What nodes are in res://player.tscn?"`,
        inputSchema: z.object({
            scene_path: z.string().optional().describe("res:// path to the scene. Omit for active scene."),
            depth: z.number().int().min(1).max(50).default(10).describe("Max depth to traverse")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ scene_path, depth }) => {
        const tree = await godotRequest("GET", "/scene/tree", { scene_path, depth });
        return {
            content: [{ type: "text", text: JSON.stringify(tree, null, 2) }]
        };
    });
    // ── Get node properties ─────────────────────────────────────────────────
    server.registerTool("godot_get_node", {
        title: "Get Node Properties",
        description: `Returns all properties of a specific node by its scene path.

Args:
  - node_path (string): Full node path e.g. "/root/Main/Player" or "Player/Sprite2D"
  - scene_path (string, optional): Scene to look in. Defaults to active scene.

Returns:
  { name, type, path, properties: Record<string, unknown> }

Examples:
  - Use when: "What are the properties of the Player node?"
  - Use when: "Get transform of res://enemy.tscn root node"`,
        inputSchema: z.object({
            node_path: z.string().describe("Node path within the scene"),
            scene_path: z.string().optional().describe("res:// path to the scene. Omit for active scene.")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ node_path, scene_path }) => {
        const node = await godotRequest("GET", "/scene/node", { node_path, scene_path });
        return {
            content: [{ type: "text", text: JSON.stringify(node, null, 2) }]
        };
    });
    // ── Add node ────────────────────────────────────────────────────────────
    server.registerTool("godot_add_node", {
        title: "Add Node to Scene",
        description: `Adds a new node of the specified type as a child of the given parent node.

Args:
  - parent_path (string): Node path of the parent e.g. "/root/Main"
  - node_type (string): Godot class name e.g. "Sprite2D", "CharacterBody2D", "Label", "AudioStreamPlayer"
  - node_name (string): Name for the new node
  - scene_path (string, optional): Scene to modify. Defaults to active scene.
  - properties (object, optional): Initial property values to set on the new node.

Returns:
  { name, type, path } of the created node.

Examples:
  - Use when: "Add a Sprite2D called PlayerSprite under /root/Main"
  - Use when: "Add a Label node to the HUD with text 'Score: 0'"`,
        inputSchema: z.object({
            parent_path: z.string().describe("Node path of the parent node"),
            node_type: z.string().describe("Godot class name for the new node"),
            node_name: z.string().describe("Name for the new node"),
            scene_path: z.string().optional().describe("Scene to modify. Omit for active scene."),
            properties: z.record(z.unknown()).optional().describe("Initial property key/value pairs")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async ({ parent_path, node_type, node_name, scene_path, properties }) => {
        const result = await godotRequest("POST", "/scene/node", {
            parent_path, node_type, node_name, scene_path, properties
        });
        return {
            content: [{ type: "text", text: `Node created: ${JSON.stringify(result, null, 2)}` }]
        };
    });
    // ── Remove node ─────────────────────────────────────────────────────────
    server.registerTool("godot_remove_node", {
        title: "Remove Node from Scene",
        description: `Removes a node (and all its children) from the scene. This is destructive and cannot be undone via MCP.

Args:
  - node_path (string): Full node path to remove e.g. "/root/Main/OldEnemy"
  - scene_path (string, optional): Scene to modify. Defaults to active scene.

Returns:
  Confirmation message.`,
        inputSchema: z.object({
            node_path: z.string().describe("Full node path to remove"),
            scene_path: z.string().optional().describe("Scene to modify. Omit for active scene.")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    }, async ({ node_path, scene_path }) => {
        await godotRequest("DELETE", "/scene/node", { node_path, scene_path });
        return {
            content: [{ type: "text", text: `Node removed: ${node_path}` }]
        };
    });
    // ── Set node property ───────────────────────────────────────────────────
    server.registerTool("godot_set_node_property", {
        title: "Set Node Property",
        description: `Sets one or more properties on an existing node.

Args:
  - node_path (string): Full node path e.g. "/root/Main/Player"
  - properties (object): Key/value pairs to set. Values must be JSON-serialisable Godot variants.
    Common keys: "position", "rotation", "scale", "visible", "modulate", "text", "texture"
  - scene_path (string, optional): Scene to modify. Defaults to active scene.

Returns:
  Updated property values.

Examples:
  - Use when: "Move the Player to position (100, 200)"
    -> properties: { "position": {"x": 100, "y": 200} }
  - Use when: "Hide the HUD node"
    -> properties: { "visible": false }`,
        inputSchema: z.object({
            node_path: z.string().describe("Node path to update"),
            properties: z.record(z.unknown()).describe("Properties to set as key/value pairs"),
            scene_path: z.string().optional().describe("Scene to modify. Omit for active scene.")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async ({ node_path, properties, scene_path }) => {
        const result = await godotRequest("PUT", "/scene/node/properties", {
            node_path, properties, scene_path
        });
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
        };
    });
    // ── Move / reparent node ────────────────────────────────────────────────
    server.registerTool("godot_reparent_node", {
        title: "Reparent Node",
        description: `Moves a node to a new parent within the same scene, preserving its world transform.

Args:
  - node_path (string): Node to move e.g. "/root/Main/Enemy"
  - new_parent_path (string): Destination parent e.g. "/root/Main/EnemyGroup"
  - scene_path (string, optional): Scene to modify. Defaults to active scene.
  - keep_global_transform (boolean, optional): Whether to preserve world-space transform (default: true)

Returns:
  New node path after reparenting.`,
        inputSchema: z.object({
            node_path: z.string().describe("Node to reparent"),
            new_parent_path: z.string().describe("Destination parent node path"),
            scene_path: z.string().optional().describe("Scene to modify. Omit for active scene."),
            keep_global_transform: z.boolean().default(true).describe("Preserve world-space transform")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async ({ node_path, new_parent_path, scene_path, keep_global_transform }) => {
        const result = await godotRequest("POST", "/scene/node/reparent", {
            node_path, new_parent_path, scene_path, keep_global_transform
        });
        return {
            content: [{ type: "text", text: `Node moved. New path: ${result.new_path}` }]
        };
    });
    // ── Instantiate scene ───────────────────────────────────────────────────
    server.registerTool("godot_instantiate_scene", {
        title: "Instantiate Scene as Node",
        description: `Instantiates an existing .tscn file as a child node inside another scene.

Args:
  - scene_to_instantiate (string): res:// path of the scene to instance e.g. "res://enemies/goblin.tscn"
  - parent_path (string): Node path of the parent in the target scene e.g. "/root/Main"
  - node_name (string, optional): Override the instance name. Defaults to the scene file's stem.
  - target_scene_path (string, optional): Scene that will receive the instance. Defaults to active scene.
  - properties (object, optional): Properties to override on the root node of the instance.

Returns:
  { name, type, path } of the instantiated node.

Examples:
  - Use when: "Add a Goblin enemy to the level at position (300, 100)"
    -> scene_to_instantiate: "res://enemies/goblin.tscn", parent_path: "/root/Level"
       properties: { "position": {"x": 300, "y": 100} }`,
        inputSchema: z.object({
            scene_to_instantiate: z.string().describe("res:// path to the .tscn to instance"),
            parent_path: z.string().describe("Parent node path in the target scene"),
            node_name: z.string().optional().describe("Override instance name"),
            target_scene_path: z.string().optional().describe("Scene to add the instance to. Omit for active scene."),
            properties: z.record(z.unknown()).optional().describe("Property overrides on the instance root node")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async ({ scene_to_instantiate, parent_path, node_name, target_scene_path, properties }) => {
        const result = await godotRequest("POST", "/scene/instantiate", {
            scene_to_instantiate, parent_path, node_name, target_scene_path, properties
        });
        return {
            content: [{ type: "text", text: `Scene instantiated: ${JSON.stringify(result, null, 2)}` }]
        };
    });
    // ── Save scene ──────────────────────────────────────────────────────────
    server.registerTool("godot_save_scene", {
        title: "Save Scene",
        description: `Saves the specified scene (or active scene) to disk.

Args:
  - scene_path (string, optional): res:// path of the scene to save. Omit for active scene.
  - save_as (string, optional): New res:// path to save a copy to (like Save As).

Returns:
  Confirmation with the saved path.`,
        inputSchema: z.object({
            scene_path: z.string().optional().describe("Scene to save. Omit for active scene."),
            save_as: z.string().optional().describe("New path to save a copy (Save As)")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ scene_path, save_as }) => {
        const result = await godotRequest("POST", "/scene/save", { scene_path, save_as });
        return {
            content: [{ type: "text", text: `Scene saved to: ${result.saved_path}` }]
        };
    });
}
//# sourceMappingURL=scene-tools.js.map
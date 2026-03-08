import { z } from "zod";
import { godotRequest } from "../services/godotClient.js";
export function registerSceneTools(server) {
    // ── Get Scene Tree ──────────────────────────────────────────────────────────
    server.registerTool("godot_get_scene_tree", {
        title: "Get Scene Tree",
        description: `Returns the full node tree of the currently open scene in the Godot editor.

Each node includes its name, type, NodePath, and child nodes recursively.

Returns:
  {
    "root": {
      "name": string,       // Node name
      "type": string,       // Godot class e.g. "Node2D", "CharacterBody2D"
      "path": string,       // Full NodePath e.g. "Player/Sprite2D"
      "children": [...]     // Recursive child nodes
    },
    "scene_path": string    // Filesystem path e.g. "res://scenes/main.tscn"
  }

Examples:
  - Use to understand existing scene structure before adding nodes
  - Use to find the correct NodePath when referencing a node by path`,
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async () => {
        try {
            const data = await godotRequest("GET", "/scene/tree");
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Get Node Properties ─────────────────────────────────────────────────────
    server.registerTool("godot_get_node_properties", {
        title: "Get Node Properties",
        description: `Returns all exported and built-in properties of a node identified by its NodePath.

Args:
  - node_path (string): Full NodePath e.g. "Player/Sprite2D" or "/root/Main/Player"

Returns a flat key/value map of all readable properties on the node.

Examples:
  - Use to inspect position, rotation, scale, texture, visibility of a node
  - Use before modifying a node to understand its current state`,
        inputSchema: z.object({
            node_path: z.string().min(1).describe("NodePath of the target node e.g. 'Player/Sprite2D'")
        }).strict(),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ node_path }) => {
        try {
            const data = await godotRequest("GET", `/node/properties?path=${encodeURIComponent(node_path)}`);
            return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Add Node ────────────────────────────────────────────────────────────────
    server.registerTool("godot_add_node", {
        title: "Add Node to Scene",
        description: `Creates a new node of a given Godot class and adds it as a child of a parent node.

Args:
  - parent_path (string): NodePath of the parent node e.g. "." for scene root
  - node_type (string): Godot class name e.g. "Sprite2D", "CharacterBody2D", "Label", "AudioStreamPlayer"
  - node_name (string): Name for the new node
  - properties (object, optional): Key/value map of properties to set immediately on creation
    e.g. { "position": {"x": 100, "y": 200}, "visible": true }

Returns the NodePath of the newly created node.

Examples:
  - Add a Sprite2D named "PlayerSprite" under the "Player" node
  - Add a CollisionShape2D with a RectangleShape2D to a CharacterBody2D`,
        inputSchema: z.object({
            parent_path: z.string().min(1).describe("NodePath of the parent node. Use '.' for scene root."),
            node_type: z.string().min(1).describe("Godot class name e.g. 'Sprite2D', 'Label', 'Node3D'"),
            node_name: z.string().min(1).describe("Name to give the new node"),
            properties: z.record(z.unknown()).optional().describe("Optional properties to set on creation")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async (params) => {
        try {
            const body = {
                parent_path: params.parent_path,
                node_type: params.node_type,
                node_name: params.node_name,
                properties: params.properties
            };
            const data = await godotRequest("POST", "/scene/add_node", body);
            return { content: [{ type: "text", text: `Node created at: ${data.node_path}` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Remove Node ─────────────────────────────────────────────────────────────
    server.registerTool("godot_remove_node", {
        title: "Remove Node from Scene",
        description: `Removes a node (and all its children) from the current scene by NodePath.

Args:
  - node_path (string): NodePath of the node to remove e.g. "Player/OldSprite"

WARNING: This is destructive. The node and all children are deleted from the scene.
Use godot_get_scene_tree first to confirm the path before removing.`,
        inputSchema: z.object({
            node_path: z.string().min(1).describe("NodePath of the node to remove")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }
    }, async ({ node_path }) => {
        try {
            const body = { node_path };
            await godotRequest("POST", "/scene/remove_node", body);
            return { content: [{ type: "text", text: `Node removed: ${node_path}` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Move / Reparent Node ────────────────────────────────────────────────────
    server.registerTool("godot_move_node", {
        title: "Move or Reparent Node",
        description: `Moves a node to a new parent and/or changes its position (transform) in the scene.

Args:
  - node_path (string): NodePath of the node to move
  - new_parent_path (string, optional): NodePath of the new parent. Omit to keep current parent.
  - new_position (object, optional): New position vector. Use {x, y} for 2D or {x, y, z} for 3D.

Examples:
  - Move "Enemy" under the "Enemies" container node
  - Change the position of "Coin" to {x: 300, y: 150}
  - Reparent and reposition at the same time`,
        inputSchema: z.object({
            node_path: z.string().min(1).describe("NodePath of the node to move"),
            new_parent_path: z.string().optional().describe("NodePath of the new parent node"),
            new_position: z.union([
                z.object({ x: z.number(), y: z.number() }),
                z.object({ x: z.number(), y: z.number(), z: z.number() })
            ]).optional().describe("New world position for the node")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async (params) => {
        try {
            const body = {
                node_path: params.node_path,
                new_parent_path: params.new_parent_path,
                new_position: params.new_position
            };
            await godotRequest("POST", "/scene/move_node", body);
            return { content: [{ type: "text", text: `Node moved: ${params.node_path}` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Set Node Property ───────────────────────────────────────────────────────
    server.registerTool("godot_set_node_property", {
        title: "Set Node Property",
        description: `Sets a single property on a node identified by NodePath.

Args:
  - node_path (string): NodePath of the target node
  - property (string): Property name e.g. "position", "texture", "modulate", "visible", "scale"
  - value (any): The new value. Use Godot-compatible types:
    - Vector2: {"x": 0, "y": 0}
    - Vector3: {"x": 0, "y": 0, "z": 0}
    - Color: {"r": 1, "g": 0, "b": 0, "a": 1}
    - Resource path: "res://textures/player.png"
    - Primitives: number, bool, string

Examples:
  - Set "Player/Sprite2D" property "texture" to "res://assets/player.png"
  - Set "UI/HealthBar" property "value" to 80
  - Set "Enemy" property "visible" to false`,
        inputSchema: z.object({
            node_path: z.string().min(1).describe("NodePath of the target node"),
            property: z.string().min(1).describe("Property name to set"),
            value: z.unknown().describe("New property value (Godot-compatible type)")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async ({ node_path, property, value }) => {
        try {
            const body = { node_path, property, value };
            await godotRequest("POST", "/node/set_property", body);
            return { content: [{ type: "text", text: `Property '${property}' set on ${node_path}` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Instantiate Scene ───────────────────────────────────────────────────────
    server.registerTool("godot_instantiate_scene", {
        title: "Instantiate Scene as Child",
        description: `Instantiates a .tscn scene file and adds it as a child node in the current scene.
This is the primary way to add prefab-style assets (characters, props, UI elements) to a scene.

Args:
  - scene_path (string): Resource path to the .tscn file e.g. "res://scenes/enemy.tscn"
  - parent_path (string): NodePath of the parent node to attach to. Use "." for scene root.
  - node_name (string, optional): Override the instance's name. Defaults to the scene's root name.
  - position (object, optional): Initial position {x, y} for 2D or {x, y, z} for 3D

Returns the NodePath of the instantiated scene root.

Examples:
  - Add an enemy prefab at position (400, 300)
  - Instantiate a UI panel under the CanvasLayer`,
        inputSchema: z.object({
            scene_path: z.string().startsWith("res://").describe("Resource path to .tscn file"),
            parent_path: z.string().min(1).describe("NodePath of the parent. Use '.' for root."),
            node_name: z.string().optional().describe("Optional override name for the instance"),
            position: z.union([
                z.object({ x: z.number(), y: z.number() }),
                z.object({ x: z.number(), y: z.number(), z: z.number() })
            ]).optional().describe("Initial position of the instantiated scene")
        }).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
    }, async (params) => {
        try {
            const body = {
                scene_path: params.scene_path,
                parent_path: params.parent_path,
                node_name: params.node_name,
                position: params.position
            };
            const data = await godotRequest("POST", "/scene/instantiate", body);
            return { content: [{ type: "text", text: `Scene instantiated at: ${data.node_path}` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
    // ── Save Scene ──────────────────────────────────────────────────────────────
    server.registerTool("godot_save_scene", {
        title: "Save Current Scene",
        description: `Saves the currently open scene to disk (equivalent to Ctrl+S in the editor).

No arguments required. Saves to the scene's existing file path.
Use after making changes to persist them.`,
        inputSchema: z.object({}).strict(),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }
    }, async () => {
        try {
            const data = await godotRequest("POST", "/scene/save");
            return { content: [{ type: "text", text: `Scene saved: ${data.scene_path}` }] };
        }
        catch (err) {
            return { isError: true, content: [{ type: "text", text: `Error: ${err.message}` }] };
        }
    });
}
//# sourceMappingURL=sceneTools.js.map
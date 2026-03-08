# Godot MCP Server

Connect Claude to your Godot 4 project. Claude can read and manipulate scenes, nodes, scripts, and assets directly in your editor.

---

## Architecture

```
Claude (claude.ai)
    │  MCP (stdio)
    ▼
godot-mcp-server  (Node.js, runs locally)
    │  HTTP  localhost:9080
    ▼
MCP Bridge Plugin  (GDScript, runs inside Godot editor)
    │
    ▼
Godot Editor
```

---

## Setup

### 1. Install the MCP Server

```bash
cd godot-mcp-server
npm install
npm run build
```

### 2. Install the Godot Plugin

Copy the `godot-plugin/addons/mcp_bridge` folder into your Godot project's `addons/` directory:

```
your-godot-project/
└── addons/
    └── mcp_bridge/
        ├── plugin.cfg
        ├── mcp_bridge.gd
        └── mcp_http_server.gd
```

Then in Godot: **Project → Project Settings → Plugins** → enable **MCP Bridge**.

You should see: `[MCP Bridge] Listening on http://127.0.0.1:9080` in the Output panel.

### 3. Configure Claude

Add to your Claude MCP config (`claude_desktop_config.json` or equivalent):

```json
{
  "mcpServers": {
    "godot": {
      "command": "node",
      "args": ["/absolute/path/to/godot-mcp-server/dist/index.js"],
      "env": {
        "GODOT_PORT": "9080"
      }
    }
  }
}
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `GODOT_HOST` | `127.0.0.1` | Host where Godot is running |
| `GODOT_PORT` | `9080` | Port the MCP Bridge plugin listens on |

---

## Available Tools

### Scene Tools
| Tool | Description |
|---|---|
| `godot_list_scenes` | List all open scenes |
| `godot_get_scene_tree` | Get full node hierarchy |
| `godot_get_node` | Get all properties of a specific node |
| `godot_add_node` | Add a new node to a scene |
| `godot_remove_node` | Remove a node and its children |
| `godot_set_node_property` | Set one or more properties on a node |
| `godot_reparent_node` | Move a node to a new parent |
| `godot_instantiate_scene` | Add a .tscn as an instance in a scene |
| `godot_save_scene` | Save the current scene to disk |

### Script Tools
| Tool | Description |
|---|---|
| `godot_read_script` | Read a .gd file |
| `godot_write_script` | Write/create a .gd file |
| `godot_run_script` | Execute a GDScript expression in the editor |

### Asset / Filesystem Tools
| Tool | Description |
|---|---|
| `godot_list_files` | List files in the project |
| `godot_get_resource` | Get metadata about a resource |
| `godot_assign_resource` | Assign a resource to a node property |
| `godot_create_scene` | Create a new empty .tscn file |

---

## Example Prompts

Once connected, you can ask Claude things like:

- *"Show me the scene tree of the current scene"*
- *"Add a Sprite2D called PlayerSprite as a child of /root/Main/Player"*
- *"Set the position of the Enemy node to (400, 300)"*
- *"Instantiate res://enemies/goblin.tscn under /root/Level at position (200, 150)"*
- *"List all .tscn files in the project"*
- *"Read the player.gd script"*
- *"Create a new scene at res://levels/level2.tscn with a Node2D root"*

---

## Notes

- The MCP Bridge plugin must be active and Godot must be open for any tools to work.
- `godot_run_script` executes arbitrary GDScript — use with care.
- Scene edits are live in the editor but **not saved automatically**. Use `godot_save_scene` to persist changes.
- The plugin binds to `127.0.0.1` only (no external access).

@tool
extends Node
class_name MCPHTTPServer

# ─── HTTP Server using TCPServer ────────────────────────────────────────────
var _tcp: TCPServer = TCPServer.new()
var _connections: Array[StreamPeerTCP] = []

func start(port: int) -> void:
	var err := _tcp.listen(port, "127.0.0.1")
	if err != OK:
		push_error("[MCP Bridge] Failed to start TCP server on port %d: %s" % [port, error_string(err)])

func stop() -> void:
	_tcp.stop()

func _process(_delta: float) -> void:
	# Accept new connections
	while _tcp.is_connection_available():
		var peer := _tcp.take_connection()
		if peer:
			_connections.append(peer)

	# Handle each connection
	var to_remove: Array[StreamPeerTCP] = []
	for peer in _connections:
		if peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
			var available := peer.get_available_bytes()
			if available > 0:
				var raw := peer.get_utf8_string(available)
				_handle_request(peer, raw)
				to_remove.append(peer)
		elif peer.get_status() != StreamPeerTCP.STATUS_CONNECTING:
			to_remove.append(peer)

	for peer in to_remove:
		_connections.erase(peer)
		peer.disconnect_from_host()


# ─── Request Parsing ─────────────────────────────────────────────────────────
func _handle_request(peer: StreamPeerTCP, raw: String) -> void:
	var lines := raw.split("\r\n")
	if lines.is_empty():
		_send_error(peer, 400, "Empty request")
		return

	var request_line := lines[0].split(" ")
	if request_line.size() < 2:
		_send_error(peer, 400, "Bad request line")
		return

	var method := request_line[0]
	var full_path := request_line[1]
	var path := full_path.split("?")[0]

	# Parse body
	var body_start := raw.find("\r\n\r\n")
	var body_str := "" if body_start == -1 else raw.substr(body_start + 4)
	var body: Dictionary = {}
	if body_str.length() > 0:
		var json := JSON.new()
		if json.parse(body_str) == OK:
			body = json.get_data()

	var response := _route(method, path, body)
	_send_json(peer, 200, response)


# ─── Router ──────────────────────────────────────────────────────────────────
func _route(method: String, path: String, body: Dictionary) -> Dictionary:
	match [method, path]:
		["GET", "/scenes"]:        return _scenes_list()
		["GET", "/scene/tree"]:    return _scene_tree(body)
		["GET", "/scene/node"]:    return _scene_node_get(body)
		["POST", "/scene/node"]:   return _scene_node_add(body)
		["PUT", "/scene/node/properties"]: return _scene_node_set_props(body)
		["DELETE", "/scene/node"]: return _scene_node_remove(body)
		["POST", "/scene/node/reparent"]: return _scene_node_reparent(body)
		["POST", "/scene/instantiate"]:   return _scene_instantiate(body)
		["POST", "/scene/save"]:   return _scene_save(body)
		["POST", "/scenes/create"]: return _scene_create(body)
		["GET", "/filesystem/list"]:     return _fs_list(body)
		["GET", "/filesystem/file"]:     return _fs_file_read(body)
		["POST", "/filesystem/file"]:    return _fs_file_write(body)
		["GET", "/filesystem/resource"]: return _fs_resource_info(body)
		["POST", "/filesystem/assign-resource"]: return _fs_assign_resource(body)
		["POST", "/script/run"]:   return _script_run(body)
		_:
			return _err("Route not found: %s %s" % [method, path])


# ─── Scene Handlers ──────────────────────────────────────────────────────────
func _get_scene(scene_path: Variant) -> Node:
	if scene_path != null and scene_path != "":
		var packed: PackedScene = load(scene_path)
		if packed == null:
			return null
		return packed.instantiate()
	var ei := EditorInterface.get_edited_scene_root() if Engine.is_editor_hint() else get_tree().root
	return ei

func _scenes_list() -> Dictionary:
	var ei := EditorInterface
	var result: Array[Dictionary] = []
	# In Godot 4, edited scene root is the main scene; iterate open scenes if API available
	var root := EditorInterface.get_edited_scene_root()
	if root:
		result.append({
			"path": root.scene_file_path,
			"root_node": root.name,
			"root_type": root.get_class(),
			"node_count": _count_nodes(root)
		})
	return {"success": true, "data": result}

func _count_nodes(node: Node) -> int:
	var count := 1
	for child in node.get_children():
		count += _count_nodes(child)
	return count

func _node_to_dict(node: Node, depth: int, max_depth: int) -> Dictionary:
	var d := {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
		"children": []
	}
	if depth < max_depth:
		for child in node.get_children():
			d["children"].append(_node_to_dict(child, depth + 1, max_depth))
	return d

func _scene_tree(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No scene is currently open in the editor.")
	var max_depth: int = body.get("depth", 10)
	return {"success": true, "data": _node_to_dict(root, 0, max_depth)}

func _scene_node_get(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene.")
	var node_path: String = body.get("node_path", "")
	var node := root.get_node_or_null(node_path)
	if node == null:
		return _err("Node not found: %s" % node_path)
	var props := {}
	for prop in node.get_property_list():
		if prop["usage"] & PROPERTY_USAGE_EDITOR:
			props[prop["name"]] = _variant_to_json(node.get(prop["name"]))
	var d := _node_to_dict(node, 0, 1)
	d["properties"] = props
	return {"success": true, "data": d}

func _scene_node_add(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene.")
	var parent := root.get_node_or_null(body.get("parent_path", ""))
	if parent == null:
		return _err("Parent node not found: %s" % body.get("parent_path", ""))
	var node_type: String = body.get("node_type", "Node")
	var node_name: String = body.get("node_name", node_type)
	var new_node := ClassDB.instantiate(node_type) as Node
	if new_node == null:
		return _err("Unknown node type: %s" % node_type)
	new_node.name = node_name
	parent.add_child(new_node)
	new_node.owner = root
	var props: Dictionary = body.get("properties", {})
	for key in props:
		new_node.set(key, _json_to_variant(props[key]))
	return {"success": true, "data": _node_to_dict(new_node, 0, 1)}

func _scene_node_remove(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene.")
	var node := root.get_node_or_null(body.get("node_path", ""))
	if node == null:
		return _err("Node not found: %s" % body.get("node_path", ""))
	node.queue_free()
	return {"success": true, "data": null}

func _scene_node_set_props(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene.")
	var node := root.get_node_or_null(body.get("node_path", ""))
	if node == null:
		return _err("Node not found: %s" % body.get("node_path", ""))
	var props: Dictionary = body.get("properties", {})
	var updated := {}
	for key in props:
		var val = _json_to_variant(props[key])
		node.set(key, val)
		updated[key] = _variant_to_json(node.get(key))
	return {"success": true, "data": updated}

func _scene_node_reparent(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene.")
	var node := root.get_node_or_null(body.get("node_path", ""))
	if node == null:
		return _err("Node not found: %s" % body.get("node_path", ""))
	var new_parent := root.get_node_or_null(body.get("new_parent_path", ""))
	if new_parent == null:
		return _err("New parent not found: %s" % body.get("new_parent_path", ""))
	var keep_transform: bool = body.get("keep_global_transform", true)
	node.reparent(new_parent, keep_transform)
	return {"success": true, "data": {"new_path": str(node.get_path())}}

func _scene_instantiate(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene.")
	var packed: PackedScene = load(body.get("scene_to_instantiate", ""))
	if packed == null:
		return _err("Could not load scene: %s" % body.get("scene_to_instantiate", ""))
	var parent := root.get_node_or_null(body.get("parent_path", ""))
	if parent == null:
		return _err("Parent not found: %s" % body.get("parent_path", ""))
	var instance := packed.instantiate()
	var override_name: String = body.get("node_name", "")
	if override_name != "":
		instance.name = override_name
	parent.add_child(instance)
	instance.owner = root
	var props: Dictionary = body.get("properties", {})
	for key in props:
		instance.set(key, _json_to_variant(props[key]))
	return {"success": true, "data": _node_to_dict(instance, 0, 1)}

func _scene_save(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene to save.")
	var save_as: String = body.get("save_as", "")
	var save_path := save_as if save_as != "" else root.scene_file_path
	if save_path == "":
		return _err("Scene has no path. Provide a 'save_as' path.")
	var packed := PackedScene.new()
	packed.pack(root)
	var err := ResourceSaver.save(packed, save_path)
	if err != OK:
		return _err("Failed to save scene: %s" % error_string(err))
	return {"success": true, "data": {"saved_path": save_path}}

func _scene_create(body: Dictionary) -> Dictionary:
	var scene_path: String = body.get("scene_path", "")
	var root_type: String = body.get("root_type", "Node")
	var root_name: String = body.get("root_name", scene_path.get_file().get_basename())
	var root_node := ClassDB.instantiate(root_type) as Node
	if root_node == null:
		return _err("Unknown root type: %s" % root_type)
	root_node.name = root_name
	var packed := PackedScene.new()
	packed.pack(root_node)
	var err := ResourceSaver.save(packed, scene_path)
	if err != OK:
		root_node.queue_free()
		return _err("Failed to save new scene: %s" % error_string(err))
	root_node.queue_free()
	var open: bool = body.get("open_in_editor", true)
	if open:
		EditorInterface.open_scene_from_path(scene_path)
	return {"success": true, "data": {"path": scene_path, "root_node": root_name, "root_type": root_type}}


# ─── Filesystem Handlers ─────────────────────────────────────────────────────
func _fs_list(body: Dictionary) -> Dictionary:
	var directory: String = body.get("directory", "res://")
	var filter_type: String = body.get("filter_type", "")
	var recursive: bool = body.get("recursive", false)
	var limit: int = body.get("limit", 50)
	var offset: int = body.get("offset", 0)

	var all_files: Array[String] = []
	_collect_files(directory, filter_type, recursive, all_files)
	all_files.sort()

	var total := all_files.size()
	var page := all_files.slice(offset, offset + limit)
	var items: Array[Dictionary] = []
	for f in page:
		items.append({"path": f, "name": f.get_file(), "type": f.get_extension()})

	return {"success": true, "data": {
		"total": total, "count": items.size(), "offset": offset,
		"has_more": offset + items.size() < total,
		"items": items
	}}

func _collect_files(dir: String, ext_filter: String, recursive: bool, results: Array[String]) -> void:
	var d := DirAccess.open(dir)
	if d == null:
		return
	d.list_dir_begin()
	var fname := d.get_next()
	while fname != "":
		if not fname.begins_with("."):
			var full := dir.path_join(fname)
			if d.current_is_dir():
				if recursive:
					_collect_files(full, ext_filter, recursive, results)
			else:
				if ext_filter == "" or fname.get_extension() == ext_filter:
					results.append(full)
		fname = d.get_next()

func _fs_file_read(body: Dictionary) -> Dictionary:
	var file_path: String = body.get("file_path", "")
	var f := FileAccess.open(file_path, FileAccess.READ)
	if f == null:
		return _err("Cannot open file: %s" % file_path)
	var content := f.get_as_text()
	f.close()
	return {"success": true, "data": {"path": file_path, "content": content}}

func _fs_file_write(body: Dictionary) -> Dictionary:
	var file_path: String = body.get("file_path", "")
	var content: String = body.get("content", "")
	var f := FileAccess.open(file_path, FileAccess.WRITE)
	if f == null:
		return _err("Cannot write to file: %s" % file_path)
	f.store_string(content)
	f.close()
	EditorInterface.get_resource_filesystem().scan()
	return {"success": true, "data": null}

func _fs_resource_info(body: Dictionary) -> Dictionary:
	var res_path: String = body.get("resource_path", "")
	if not ResourceLoader.exists(res_path):
		return _err("Resource not found: %s" % res_path)
	var type := ResourceLoader.get_resource_type(res_path)
	return {"success": true, "data": {
		"path": res_path,
		"type": type,
		"name": res_path.get_file()
	}}

func _fs_assign_resource(body: Dictionary) -> Dictionary:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		return _err("No active scene.")
	var node := root.get_node_or_null(body.get("node_path", ""))
	if node == null:
		return _err("Node not found: %s" % body.get("node_path", ""))
	var res_path: String = body.get("resource_path", "")
	var resource := load(res_path)
	if resource == null:
		return _err("Could not load resource: %s" % res_path)
	var prop: String = body.get("property", "")
	node.set(prop, resource)
	return {"success": true, "data": {"node_path": str(node.get_path()), "property": prop, "resource": res_path}}


# ─── Script Execution ────────────────────────────────────────────────────────
func _script_run(body: Dictionary) -> Dictionary:
	var code: String = body.get("code", "")
	# Wrap in an EditorScript context
	var script := GDScript.new()
	script.source_code = """
@tool
extends EditorScript
func _run():
\t%s
""" % code.replace("\n", "\n\t")
	var err := script.reload()
	if err != OK:
		return {"success": true, "data": {"success": false, "output": "", "error": "Script compile error: %s" % error_string(err)}}

	# EditorScript execution is not directly callable at runtime this way,
	# so we use an expression evaluator for single-line expressions instead.
	var expr := Expression.new()
	var parse_err := expr.parse(code)
	if parse_err != OK:
		return {"success": true, "data": {"success": false, "output": "", "error": "Parse error: %s" % expr.get_error_text()}}
	var result = expr.execute([], self)
	if expr.has_execute_failed():
		return {"success": true, "data": {"success": false, "output": "", "error": "Execution error: %s" % expr.get_error_text()}}
	return {"success": true, "data": {"success": true, "output": str(result), "error": null}}


# ─── Helpers ─────────────────────────────────────────────────────────────────
func _err(msg: String) -> Dictionary:
	return {"success": false, "error": msg}

func _send_json(peer: StreamPeerTCP, status: int, data: Dictionary) -> void:
	var body := JSON.stringify(data)
	var response := "HTTP/1.1 %d OK\r\nContent-Type: application/json\r\nContent-Length: %d\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n%s" % [status, body.length(), body]
	peer.put_data(response.to_utf8_buffer())

func _send_error(peer: StreamPeerTCP, status: int, message: String) -> void:
	_send_json(peer, status, {"success": false, "error": message})

func _variant_to_json(val: Variant) -> Variant:
	if val is Vector2:
		return {"x": val.x, "y": val.y}
	elif val is Vector3:
		return {"x": val.x, "y": val.y, "z": val.z}
	elif val is Color:
		return {"r": val.r, "g": val.g, "b": val.b, "a": val.a}
	elif val is Basis or val is Transform2D or val is Transform3D:
		return str(val)
	return val

func _json_to_variant(val: Variant) -> Variant:
	if val is Dictionary:
		if val.has("x") and val.has("y") and not val.has("z"):
			return Vector2(val["x"], val["y"])
		elif val.has("x") and val.has("y") and val.has("z"):
			return Vector3(val["x"], val["y"], val["z"])
		elif val.has("r") and val.has("g") and val.has("b"):
			return Color(val["r"], val["g"], val["b"], val.get("a", 1.0))
	return val

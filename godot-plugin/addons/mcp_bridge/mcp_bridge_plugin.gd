@tool
extends EditorPlugin

const PORT := 9080
const MAX_CLIENTS := 4

var _server: TCPServer
var _clients: Array[StreamPeerTCP] = []
var _ws_clients: Dictionary = {}  # StreamPeerTCP -> WebSocketPeer
var _poll_timer: Timer


func _enter_tree() -> void:
	_server = TCPServer.new()
	var err := _server.listen(PORT, "127.0.0.1")
	if err != OK:
		push_error("MCP Bridge: Failed to listen on port %d (error %d)" % [PORT, err])
		return

	_poll_timer = Timer.new()
	_poll_timer.wait_time = 0.05  # 20 Hz
	_poll_timer.autostart = true
	_poll_timer.timeout.connect(_poll)
	add_child(_poll_timer)

	print("MCP Bridge: Listening on ws://127.0.0.1:%d" % PORT)


func _exit_tree() -> void:
	if _poll_timer:
		_poll_timer.queue_free()
	for ws in _ws_clients.values():
		ws.close()
	_ws_clients.clear()
	_clients.clear()
	if _server:
		_server.stop()
	print("MCP Bridge: Stopped.")


# ── Polling ────────────────────────────────────────────────────────────────────

func _poll() -> void:
	# Accept new TCP connections and upgrade to WebSocket
	while _server.is_connection_available():
		if _ws_clients.size() >= MAX_CLIENTS:
			break
		var tcp: StreamPeerTCP = _server.take_connection()
		var ws := WebSocketPeer.new()
		ws.accept_stream(tcp)
		_clients.append(tcp)
		_ws_clients[tcp] = ws

	# Poll all WebSocket clients
	var to_remove: Array[StreamPeerTCP] = []
	for tcp in _clients:
		var ws: WebSocketPeer = _ws_clients[tcp]
		ws.poll()
		var state := ws.get_ready_state()

		if state == WebSocketPeer.STATE_OPEN:
			while ws.get_available_packet_count() > 0:
				var raw := ws.get_packet()
				var text := raw.get_string_from_utf8()
				var msg = JSON.parse_string(text)
				if msg is Dictionary:
					_handle_message(ws, msg)

		elif state == WebSocketPeer.STATE_CLOSED:
			to_remove.append(tcp)

	for tcp in to_remove:
		_ws_clients.erase(tcp)
		_clients.erase(tcp)


# ── Message routing ────────────────────────────────────────────────────────────

func _handle_message(ws: WebSocketPeer, msg: Dictionary) -> void:
	var id: String = msg.get("id", "")
	var command: String = msg.get("command", "")
	var params: Dictionary = msg.get("params", {})

	var result = null
	var error_msg := ""

	match command:
		"read_file":      result = _cmd_read_file(params)
		"write_file":     result = _cmd_write_file(params)
		"list_files":     result = _cmd_list_files(params)
		"get_scene_tree": result = _cmd_get_scene_tree(params)
		"get_node_properties": result = _cmd_get_node_properties(params)
		"set_node_property":   result = _cmd_set_node_property(params)
		"spawn_node":     result = _cmd_spawn_node(params)
		"remove_node":    result = _cmd_remove_node(params)
		"run_scene":      result = _cmd_run_scene(params)
		"stop_scene":     result = _cmd_stop_scene(params)
		"reload_scene":   result = _cmd_reload_scene(params)
		"open_scene":     result = _cmd_open_scene(params)
		"execute_script": result = _cmd_execute_script(params)
		"call_method":    result = _cmd_call_method(params)
		"emit_signal":    result = _cmd_emit_signal(params)
		"get_editor_selection": result = _cmd_get_editor_selection(params)
		"get_project_info":     result = _cmd_get_project_info(params)
		_:
			error_msg = "Unknown command: %s" % command

	if result is Dictionary and result.has("__error"):
		_send(ws, id, false, null, result["__error"])
	elif error_msg != "":
		_send(ws, id, false, null, error_msg)
	else:
		_send(ws, id, true, result)


func _send(ws: WebSocketPeer, id: String, success: bool, result, error: String = "") -> void:
	var response := {"id": id, "success": success}
	if success:
		response["result"] = result
	else:
		response["error"] = error
	ws.send_text(JSON.stringify(response))


func _err(msg: String) -> Dictionary:
	return {"__error": msg}


# ── Command implementations ────────────────────────────────────────────────────

func _cmd_read_file(p: Dictionary) -> Dictionary:
	var path: String = p.get("path", "")
	if not path.begins_with("res://"):
		return _err("Path must start with res://")
	if not FileAccess.file_exists(path):
		return _err("File not found: %s" % path)
	var f := FileAccess.open(path, FileAccess.READ)
	if not f:
		return _err("Cannot open file: %s" % path)
	var content := f.get_as_text()
	f.close()
	return {"content": content}


func _cmd_write_file(p: Dictionary) -> Dictionary:
	var path: String = p.get("path", "")
	var content: String = p.get("content", "")
	if not path.begins_with("res://"):
		return _err("Path must start with res://")
	var f := FileAccess.open(path, FileAccess.WRITE)
	if not f:
		return _err("Cannot write file: %s" % path)
	f.store_string(content)
	f.close()
	# Notify editor of changed file
	var fs := get_editor_interface().get_resource_filesystem()
	fs.scan()
	return {"written": path}


func _cmd_list_files(p: Dictionary) -> Dictionary:
	var directory: String = p.get("directory", "res://")
	var extension: String = p.get("extension", "")
	var recursive: bool = p.get("recursive", false)
	var files: Array[String] = []
	_collect_files(directory, extension, recursive, files)
	return {"files": files}


func _collect_files(dir_path: String, ext: String, recursive: bool, out: Array[String]) -> void:
	var dir := DirAccess.open(dir_path)
	if not dir:
		return
	dir.list_dir_begin()
	var fname := dir.get_next()
	while fname != "":
		if fname == "." or fname == "..":
			fname = dir.get_next()
			continue
		var full := dir_path.path_join(fname)
		if dir.current_is_dir():
			if recursive:
				_collect_files(full, ext, true, out)
		else:
			if ext == "" or fname.get_extension() == ext:
				out.append(full)
		fname = dir.get_next()
	dir.list_dir_end()


func _cmd_get_scene_tree(p: Dictionary) -> Dictionary:
	var root_path: String = p.get("root_path", "/root")
	var depth: int = p.get("depth", 5)
	var include_props: bool = p.get("include_properties", false)
	var root := get_tree().root.get_node_or_null(NodePath(root_path.trim_prefix("/root").trim_prefix("/")))
	if root == null:
		root = get_tree().root
	return _node_to_dict(root, depth, 0, include_props)


func _node_to_dict(node: Node, max_depth: int, current_depth: int, include_props: bool) -> Dictionary:
	var d := {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path())
	}
	if include_props:
		var props := {}
		for prop in node.get_property_list():
			if prop["usage"] & PROPERTY_USAGE_EDITOR:
				var val = node.get(prop["name"])
				props[prop["name"]] = _to_json_value(val)
		d["properties"] = props
	if current_depth < max_depth and node.get_child_count() > 0:
		var children := []
		for child in node.get_children():
			children.append(_node_to_dict(child, max_depth, current_depth + 1, include_props))
		d["children"] = children
	return d


func _cmd_get_node_properties(p: Dictionary) -> Dictionary:
	var node_path: String = p.get("node_path", "")
	var node := get_tree().root.get_node_or_null(NodePath(node_path.trim_prefix("/")))
	if not node:
		return _err("Node not found: %s" % node_path)
	var result := {}
	for prop in node.get_property_list():
		if prop["usage"] & PROPERTY_USAGE_EDITOR:
			result[prop["name"]] = _to_json_value(node.get(prop["name"]))
	return result


func _cmd_set_node_property(p: Dictionary) -> Dictionary:
	var node_path: String = p.get("node_path", "")
	var property: String = p.get("property", "")
	var value = p.get("value")
	var node := get_tree().root.get_node_or_null(NodePath(node_path.trim_prefix("/")))
	if not node:
		return _err("Node not found: %s" % node_path)
	var old_value = node.get(property)
	node.set(property, value)
	return {"old_value": _to_json_value(old_value), "new_value": _to_json_value(node.get(property))}


func _cmd_spawn_node(p: Dictionary) -> Dictionary:
	var type_or_scene: String = p.get("type", "")
	var parent_path: String = p.get("parent_path", "/root")
	var node_name: String = p.get("name", "NewNode")
	var properties: Dictionary = p.get("properties", {})

	var parent := get_tree().root.get_node_or_null(NodePath(parent_path.trim_prefix("/")))
	if not parent:
		return _err("Parent node not found: %s" % parent_path)

	var new_node: Node
	if type_or_scene.begins_with("res://"):
		var packed: PackedScene = load(type_or_scene)
		if not packed:
			return _err("Cannot load scene: %s" % type_or_scene)
		new_node = packed.instantiate()
	else:
		if not ClassDB.class_exists(type_or_scene):
			return _err("Unknown Godot class: %s" % type_or_scene)
		new_node = ClassDB.instantiate(type_or_scene)

	new_node.name = node_name
	parent.add_child(new_node)
	new_node.set_owner(get_tree().edited_scene_root if Engine.is_editor_hint() else get_tree().root)

	for key in properties:
		new_node.set(key, properties[key])

	return {"node_path": str(new_node.get_path())}


func _cmd_remove_node(p: Dictionary) -> Dictionary:
	var node_path: String = p.get("node_path", "")
	var node := get_tree().root.get_node_or_null(NodePath(node_path.trim_prefix("/")))
	if not node:
		return _err("Node not found: %s" % node_path)
	node.queue_free()
	return {"removed": node_path}


func _cmd_run_scene(p: Dictionary) -> Dictionary:
	var scene_path: String = p.get("scene_path", "")
	var ei := get_editor_interface()
	if scene_path != "":
		ei.play_custom_scene(scene_path)
	else:
		ei.play_current_scene()
	return {"running": true}


func _cmd_stop_scene(_p: Dictionary) -> Dictionary:
	get_editor_interface().stop_playing_scene()
	return {"stopped": true}


func _cmd_reload_scene(_p: Dictionary) -> Dictionary:
	get_editor_interface().reload_scene_from_path(
		get_editor_interface().get_edited_scene_root().scene_file_path
	)
	return {"reloaded": true}


func _cmd_open_scene(p: Dictionary) -> Dictionary:
	var scene_path: String = p.get("scene_path", "")
	get_editor_interface().open_scene_from_path(scene_path)
	return {"opened": scene_path}


func _cmd_execute_script(p: Dictionary) -> Dictionary:
	var script_text: String = p.get("script", "")
	var node_path: String = p.get("node_path", "")

	var target: Node
	if node_path != "":
		target = get_tree().root.get_node_or_null(NodePath(node_path.trim_prefix("/")))
		if not target:
			return _err("Node not found: %s" % node_path)
	else:
		target = get_tree().root

	var script := GDScript.new()
	script.source_code = "extends Node\nfunc _run():\n"
	for line in script_text.split("\n"):
		script.source_code += "\t" + line + "\n"

	var err := script.reload()
	if err != OK:
		return {"output": null, "error": "Script parse error (code %d)" % err}

	var instance := Node.new()
	instance.set_script(script)
	target.add_child(instance)
	var output = instance.call("_run")
	instance.queue_free()
	return {"output": _to_json_value(output)}


func _cmd_call_method(p: Dictionary) -> Dictionary:
	var node_path: String = p.get("node_path", "")
	var method: String = p.get("method", "")
	var args: Array = p.get("args", [])
	var node := get_tree().root.get_node_or_null(NodePath(node_path.trim_prefix("/")))
	if not node:
		return _err("Node not found: %s" % node_path)
	if not node.has_method(method):
		return _err("Method not found: %s on %s" % [method, node_path])
	var result = node.callv(method, args)
	return {"return_value": _to_json_value(result)}


func _cmd_emit_signal(p: Dictionary) -> Dictionary:
	var node_path: String = p.get("node_path", "")
	var signal_name: String = p.get("signal_name", "")
	var args: Array = p.get("args", [])
	var node := get_tree().root.get_node_or_null(NodePath(node_path.trim_prefix("/")))
	if not node:
		return _err("Node not found: %s" % node_path)
	node.emit_signal(signal_name, args)
	return {"emitted": signal_name}


func _cmd_get_editor_selection(_p: Dictionary) -> Dictionary:
	var selection := get_editor_interface().get_selection()
	var nodes := selection.get_selected_nodes()
	var result := []
	for node in nodes:
		result.append({"path": str(node.get_path()), "type": node.get_class(), "name": node.name})
	return {"selected": result}


func _cmd_get_project_info(_p: Dictionary) -> Dictionary:
	return {
		"name": ProjectSettings.get_setting("application/config/name", ""),
		"description": ProjectSettings.get_setting("application/config/description", ""),
		"version": ProjectSettings.get_setting("application/config/version", ""),
		"main_scene": ProjectSettings.get_setting("application/run/main_scene", ""),
		"godot_version": Engine.get_version_info(),
		"project_path": ProjectSettings.globalize_path("res://")
	}


# ── Helpers ────────────────────────────────────────────────────────────────────

func _to_json_value(val) -> Variant:
	match typeof(val):
		TYPE_NIL:        return null
		TYPE_BOOL:       return val
		TYPE_INT:        return val
		TYPE_FLOAT:      return val
		TYPE_STRING:     return val
		TYPE_VECTOR2:    return {"x": val.x, "y": val.y}
		TYPE_VECTOR3:    return {"x": val.x, "y": val.y, "z": val.z}
		TYPE_COLOR:      return {"r": val.r, "g": val.g, "b": val.b, "a": val.a}
		TYPE_RECT2:      return {"x": val.position.x, "y": val.position.y, "w": val.size.x, "h": val.size.y}
		TYPE_ARRAY:
			var arr := []
			for item in val:
				arr.append(_to_json_value(item))
			return arr
		TYPE_DICTIONARY:
			var d := {}
			for key in val:
				d[str(key)] = _to_json_value(val[key])
			return d
		_:
			return str(val)

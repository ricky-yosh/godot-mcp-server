@tool
extends HTTPServerManager
## Handles all HTTP requests from the Claude MCP TypeScript server.
## Routes requests to the appropriate editor API calls.

var editor_plugin: EditorPlugin

# ─── HTTPServer callback ───────────────────────────────────────────────────────

func _handle_request(request: HTTPServerRequest) -> void:
	var path: String = request.get_path()
	var method: String = request.get_method()
	var body_text: String = request.get_body()
	var body: Dictionary = {}
	if body_text.length() > 0:
		body = JSON.parse_string(body_text) if body_text else {}

	var result: Dictionary = _route(method, path, request, body)
	var json_str: String = JSON.stringify(result)
	request.send_response(200, "application/json", json_str)

# ─── Router ────────────────────────────────────────────────────────────────────

func _route(method: String, path: String, request: HTTPServerRequest, body: Dictionary) -> Dictionary:
	# Strip query string for routing
	var route: String = path.split("?")[0]

	match route:
		"/scene/tree":         return _scene_get_tree()
		"/scene/save":         return _scene_save()
		"/scene/add_node":     return _scene_add_node(body)
		"/scene/remove_node":  return _scene_remove_node(body)
		"/scene/move_node":    return _scene_move_node(body)
		"/scene/instantiate":  return _scene_instantiate(body)
		"/node/properties":    return _node_get_properties(request)
		"/node/set_property":  return _node_set_property(body)
		"/scripts/list":       return _scripts_list(request)
		"/scripts/read":       return _scripts_read(request)
		"/scripts/write":      return _scripts_write(body)
		"/scripts/attach":     return _scripts_attach(body)
		"/scripts/run":        return _scripts_run(body)
		"/assets/list":        return _assets_list(request)
		"/assets/info":        return _assets_info(request)
		"/assets/set_texture": return _assets_set_texture(body)
		"/project/info":       return _project_info()
		_:
			return _error("Unknown route: %s" % route)

# ─── Helpers ───────────────────────────────────────────────────────────────────

func _ok(data: Variant) -> Dictionary:
	return {"success": true, "data": data}

func _error(msg: String) -> Dictionary:
	return {"success": false, "error": msg}

func _get_edited_scene_root() -> Node:
	return editor_plugin.get_editor_interface().get_edited_scene_root()

func _serialize_node(node: Node, recursive: bool = true) -> Dictionary:
	var result := {
		"name": node.name,
		"type": node.get_class(),
		"path": str(node.get_path()),
		"children": []
	}
	if recursive:
		for child in node.get_children():
			result["children"].append(_serialize_node(child, true))
	return result

func _find_node_by_path(path: String) -> Node:
	var root := _get_edited_scene_root()
	if path == "." or path == str(root.get_path()):
		return root
	# Try relative path first
	var node := root.get_node_or_null(path)
	if node:
		return node
	# Try as absolute NodePath
	node = root.get_tree().root.get_node_or_null(path)
	return node

func _parse_vector(v: Variant) -> Variant:
	if v is Dictionary:
		if "z" in v:
			return Vector3(v.get("x", 0.0), v.get("y", 0.0), v.get("z", 0.0))
		return Vector2(v.get("x", 0.0), v.get("y", 0.0))
	return null

# ─── Scene Handlers ────────────────────────────────────────────────────────────

func _scene_get_tree() -> Dictionary:
	var root := _get_edited_scene_root()
	if not root:
		return _error("No scene is currently open in the editor.")
	var scene_path: String = root.scene_file_path
	return _ok({"root": _serialize_node(root), "scene_path": scene_path})

func _scene_save() -> Dictionary:
	var root := _get_edited_scene_root()
	if not root:
		return _error("No scene is currently open.")
	var scene_path: String = root.scene_file_path
	var packed := PackedScene.new()
	packed.pack(root)
	ResourceSaver.save(packed, scene_path)
	return _ok({"scene_path": scene_path})

func _scene_add_node(body: Dictionary) -> Dictionary:
	var parent_path: String = body.get("parent_path", ".")
	var node_type: String = body.get("node_type", "")
	var node_name: String = body.get("node_name", "")
	var properties: Dictionary = body.get("properties", {})

	if node_type.is_empty() or node_name.is_empty():
		return _error("node_type and node_name are required.")

	var parent := _find_node_by_path(parent_path)
	if not parent:
		return _error("Parent node not found: %s" % parent_path)

	var new_node: Node = ClassDB.instantiate(node_type)
	if not new_node:
		return _error("Unknown node type: %s" % node_type)

	new_node.name = node_name
	parent.add_child(new_node)
	new_node.owner = _get_edited_scene_root()

	# Apply initial properties
	for key in properties:
		var val: Variant = properties[key]
		var parsed_vec = _parse_vector(val)
		if parsed_vec != null:
			new_node.set(key, parsed_vec)
		else:
			new_node.set(key, val)

	return _ok({"node_path": str(new_node.get_path())})

func _scene_remove_node(body: Dictionary) -> Dictionary:
	var node_path: String = body.get("node_path", "")
	var node := _find_node_by_path(node_path)
	if not node:
		return _error("Node not found: %s" % node_path)
	node.get_parent().remove_child(node)
	node.queue_free()
	return _ok({"removed": node_path})

func _scene_move_node(body: Dictionary) -> Dictionary:
	var node_path: String = body.get("node_path", "")
	var new_parent_path = body.get("new_parent_path", null)
	var new_position = body.get("new_position", null)

	var node := _find_node_by_path(node_path)
	if not node:
		return _error("Node not found: %s" % node_path)

	# Reparent if requested
	if new_parent_path != null:
		var new_parent := _find_node_by_path(str(new_parent_path))
		if not new_parent:
			return _error("New parent not found: %s" % new_parent_path)
		var old_parent := node.get_parent()
		old_parent.remove_child(node)
		new_parent.add_child(node)
		node.owner = _get_edited_scene_root()

	# Move position if requested
	if new_position != null:
		var vec = _parse_vector(new_position)
		if vec is Vector2 and node.has_method("set"):
			node.set("position", vec)
		elif vec is Vector3 and node.has_method("set"):
			node.set("position", vec)

	return _ok({"node_path": str(node.get_path())})

func _scene_instantiate(body: Dictionary) -> Dictionary:
	var scene_path: String = body.get("scene_path", "")
	var parent_path: String = body.get("parent_path", ".")
	var node_name = body.get("node_name", null)
	var position = body.get("position", null)

	if scene_path.is_empty():
		return _error("scene_path is required.")

	if not ResourceLoader.exists(scene_path):
		return _error("Scene not found: %s" % scene_path)

	var packed: PackedScene = load(scene_path)
	if not packed:
		return _error("Failed to load scene: %s" % scene_path)

	var instance: Node = packed.instantiate()
	if node_name != null:
		instance.name = str(node_name)

	var parent := _find_node_by_path(parent_path)
	if not parent:
		return _error("Parent not found: %s" % parent_path)

	parent.add_child(instance)
	instance.owner = _get_edited_scene_root()

	if position != null:
		var vec = _parse_vector(position)
		if vec != null:
			instance.set("position", vec)

	return _ok({"node_path": str(instance.get_path())})

# ─── Node Property Handlers ────────────────────────────────────────────────────

func _node_get_properties(request: HTTPServerRequest) -> Dictionary:
	var qs: String = request.get_path().split("?")[1] if "?" in request.get_path() else ""
	var params := _parse_query(qs)
	var node_path: String = params.get("path", "")

	var node := _find_node_by_path(node_path)
	if not node:
		return _error("Node not found: %s" % node_path)

	var props := {}
	for prop in node.get_property_list():
		var pname: String = prop["name"]
		var val: Variant = node.get(pname)
		# Serialize basic types cleanly
		if val is Vector2:
			props[pname] = {"x": val.x, "y": val.y}
		elif val is Vector3:
			props[pname] = {"x": val.x, "y": val.y, "z": val.z}
		elif val is Color:
			props[pname] = {"r": val.r, "g": val.g, "b": val.b, "a": val.a}
		elif val is Resource:
			props[pname] = val.resource_path if val.resource_path else "[Resource]"
		elif val == null or val is bool or val is int or val is float or val is String:
			props[pname] = val

	return _ok(props)

func _node_set_property(body: Dictionary) -> Dictionary:
	var node_path: String = body.get("node_path", "")
	var property: String = body.get("property", "")
	var value: Variant = body.get("value", null)

	var node := _find_node_by_path(node_path)
	if not node:
		return _error("Node not found: %s" % node_path)

	var vec = _parse_vector(value)
	if vec != null:
		node.set(property, vec)
	elif value is String and value.begins_with("res://"):
		var res: Resource = load(value)
		if not res:
			return _error("Could not load resource: %s" % value)
		node.set(property, res)
	else:
		node.set(property, value)

	return _ok({"node_path": node_path, "property": property})

# ─── Script Handlers ───────────────────────────────────────────────────────────

func _scripts_list(request: HTTPServerRequest) -> Dictionary:
	var qs: String = request.get_path().split("?")[1] if "?" in request.get_path() else ""
	var params := _parse_query(qs)
	var path_filter: String = params.get("path_filter", "res://")
	var limit: int = int(params.get("limit", "50"))
	var offset: int = int(params.get("offset", "0"))

	var all_scripts: Array = []
	_find_files_recursive("res://", ".gd", all_scripts)

	if path_filter != "res://":
		all_scripts = all_scripts.filter(func(p): return p.begins_with(path_filter))

	var total: int = all_scripts.size()
	var page := all_scripts.slice(offset, offset + limit)
	var result := []
	for p in page:
		result.append({"path": p})

	return _ok({
		"scripts": result,
		"total": total,
		"has_more": offset + limit < total,
		"next_offset": offset + limit if offset + limit < total else null
	})

func _scripts_read(request: HTTPServerRequest) -> Dictionary:
	var qs: String = request.get_path().split("?")[1] if "?" in request.get_path() else ""
	var params := _parse_query(qs)
	var path: String = params.get("path", "")

	if not FileAccess.file_exists(path):
		return _error("Script not found: %s" % path)

	var file := FileAccess.open(path, FileAccess.READ)
	if not file:
		return _error("Could not open file: %s" % path)
	var content: String = file.get_as_text()
	file.close()
	return _ok({"path": path, "content": content})

func _scripts_write(body: Dictionary) -> Dictionary:
	var script_path: String = body.get("script_path", "")
	var content: String = body.get("content", "")

	if script_path.is_empty():
		return _error("script_path is required.")

	var file := FileAccess.open(script_path, FileAccess.WRITE)
	if not file:
		return _error("Could not write file: %s" % script_path)
	file.store_string(content)
	file.close()

	# Reimport the script so Godot picks it up
	if Engine.is_editor_hint():
		editor_plugin.get_editor_interface().get_resource_filesystem().scan()

	return _ok({"script_path": script_path})

func _scripts_attach(body: Dictionary) -> Dictionary:
	var node_path: String = body.get("node_path", "")
	var script_path: String = body.get("script_path", "")

	var node := _find_node_by_path(node_path)
	if not node:
		return _error("Node not found: %s" % node_path)

	if not FileAccess.file_exists(script_path):
		return _error("Script not found: %s" % script_path)

	var script: GDScript = load(script_path)
	if not script:
		return _error("Could not load script: %s" % script_path)

	node.set_script(script)
	return _ok({"node_path": node_path, "script_path": script_path})

func _scripts_run(body: Dictionary) -> Dictionary:
	var code: String = body.get("code", "")
	if code.is_empty():
		return _error("code is required.")

	# Wrap in an autoload-style script and run via EditorScript
	var script := GDScript.new()
	script.source_code = "@tool\nextends EditorScript\nfunc _run():\n"
	for line in code.split("\n"):
		script.source_code += "\t" + line + "\n"
	script.reload()

	var instance: Object = script.new()
	if instance and instance.has_method("_run"):
		instance._run()
		return _ok({"success": true, "output": "Script executed."})
	return _error("Could not execute script.")

# ─── Asset Handlers ────────────────────────────────────────────────────────────

func _assets_list(request: HTTPServerRequest) -> Dictionary:
	var qs: String = request.get_path().split("?")[1] if "?" in request.get_path() else ""
	var params := _parse_query(qs)
	var type_filter: String = params.get("type", "all")
	var path_filter: String = params.get("path_filter", "res://")
	var limit: int = int(params.get("limit", "50"))
	var offset: int = int(params.get("offset", "0"))

	var ext_map := {
		"texture": [".png", ".jpg", ".jpeg", ".webp", ".svg"],
		"scene": [".tscn", ".scn"],
		"audio": [".ogg", ".wav", ".mp3"],
		"font": [".ttf", ".otf", ".woff"],
		"material": [".tres", ".material"],
		"mesh": [".obj", ".glb", ".gltf"],
		"shader": [".gdshader", ".shader"],
		"all": []
	}
	var exts: Array = ext_map.get(type_filter, [])

	var all_files: Array = []
	if exts.is_empty():
		# All types
		for ext_list in ext_map.values():
			for e in ext_list:
				_find_files_recursive(path_filter, e, all_files)
	else:
		for e in exts:
			_find_files_recursive(path_filter, e, all_files)

	var total: int = all_files.size()
	var page := all_files.slice(offset, offset + limit)
	var result := []
	for p in page:
		result.append({"path": p, "type": type_filter})

	return _ok({
		"assets": result,
		"total": total,
		"has_more": offset + limit < total,
		"next_offset": offset + limit if offset + limit < total else null
	})

func _assets_info(request: HTTPServerRequest) -> Dictionary:
	var qs: String = request.get_path().split("?")[1] if "?" in request.get_path() else ""
	var params := _parse_query(qs)
	var path: String = params.get("path", "")
	if not FileAccess.file_exists(path):
		return _error("Asset not found: %s" % path)
	var size: int = FileAccess.get_file_as_bytes(path).size()
	return _ok({"path": path, "type": path.get_extension(), "size_bytes": size})

func _assets_set_texture(body: Dictionary) -> Dictionary:
	var node_path: String = body.get("node_path", "")
	var texture_path: String = body.get("texture_path", "")

	var node := _find_node_by_path(node_path)
	if not node:
		return _error("Node not found: %s" % node_path)

	var texture: Texture2D = load(texture_path)
	if not texture:
		return _error("Could not load texture: %s" % texture_path)

	node.set("texture", texture)
	return _ok({"node_path": node_path, "texture_path": texture_path})

# ─── Project Info ──────────────────────────────────────────────────────────────

func _project_info() -> Dictionary:
	return _ok({
		"name": ProjectSettings.get_setting("application/config/name", "Unknown"),
		"godot_version": Engine.get_version_info().get("string", "?"),
		"main_scene": ProjectSettings.get_setting("application/run/main_scene", ""),
		"project_path": ProjectSettings.globalize_path("res://")
	})

# ─── Utility ───────────────────────────────────────────────────────────────────

func _find_files_recursive(dir_path: String, extension: String, result: Array) -> void:
	var dir := DirAccess.open(dir_path)
	if not dir:
		return
	dir.list_dir_begin()
	var file_name: String = dir.get_next()
	while file_name != "":
		if file_name.begins_with("."):
			file_name = dir.get_next()
			continue
		var full_path: String = dir_path.path_join(file_name)
		if dir.current_is_dir():
			_find_files_recursive(full_path, extension, result)
		elif file_name.ends_with(extension):
			result.append(full_path)
		file_name = dir.get_next()
	dir.list_dir_end()

func _parse_query(qs: String) -> Dictionary:
	var result := {}
	if qs.is_empty():
		return result
	for pair in qs.split("&"):
		var kv := pair.split("=")
		if kv.size() == 2:
			result[kv[0]] = kv[1].uri_decode()
	return result

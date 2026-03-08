@tool
extends EditorPlugin

const PORT := 9080
var _server: MCPHTTPServer

func _enter_tree() -> void:
	_server = MCPHTTPServer.new()
	_server.start(PORT)
	add_child(_server)
	print("[MCP Bridge] Listening on http://127.0.0.1:%d" % PORT)

func _exit_tree() -> void:
	if _server:
		_server.stop()
		_server.queue_free()
	print("[MCP Bridge] Stopped.")

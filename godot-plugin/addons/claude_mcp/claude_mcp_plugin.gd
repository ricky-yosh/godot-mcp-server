@tool
extends EditorPlugin

const PORT := 6969
var _server: HTTPServer
var _handler: ClaudeMCPHandler

func _enter_tree() -> void:
	_handler = ClaudeMCPHandler.new()
	_handler.editor_plugin = self
	_server = HTTPServer.new()
	_server.listen(PORT, _handler)
	print("[ClaudeMCP] Listening on http://127.0.0.1:%d" % PORT)

func _exit_tree() -> void:
	if _server:
		_server.stop()
	print("[ClaudeMCP] Server stopped.")

func _process(_delta: float) -> void:
	if _server:
		_server.poll()

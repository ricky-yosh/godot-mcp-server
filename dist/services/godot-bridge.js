import WebSocket from "ws";
let ws = null;
let pendingRequests = new Map();
const GODOT_WS_URL = process.env.GODOT_WS_URL ?? "ws://127.0.0.1:9080";
const REQUEST_TIMEOUT_MS = 10_000;
function getConnection() {
    return new Promise((resolve, reject) => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            resolve(ws);
            return;
        }
        const socket = new WebSocket(GODOT_WS_URL);
        socket.on("open", () => {
            ws = socket;
            resolve(socket);
        });
        socket.on("message", (data) => {
            try {
                const msg = JSON.parse(data.toString());
                const pending = pendingRequests.get(msg.id);
                if (pending) {
                    clearTimeout(pending.timeout);
                    pendingRequests.delete(msg.id);
                    pending.resolve(msg);
                }
            }
            catch {
                // Ignore malformed messages
            }
        });
        socket.on("close", () => {
            ws = null;
            // Reject all pending requests
            for (const [id, pending] of pendingRequests) {
                clearTimeout(pending.timeout);
                pending.reject(new Error("Godot connection closed"));
                pendingRequests.delete(id);
            }
        });
        socket.on("error", (err) => {
            ws = null;
            reject(new Error(`Cannot connect to Godot at ${GODOT_WS_URL}: ${err.message}. Make sure the GodotMCPBridge plugin is running.`));
        });
    });
}
export async function sendCommand(command, params = {}) {
    const socket = await getConnection();
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingRequests.delete(id);
            reject(new Error(`Timeout waiting for Godot response to command: ${command}`));
        }, REQUEST_TIMEOUT_MS);
        pendingRequests.set(id, { resolve: (res) => resolve(res.result), reject, timeout });
        socket.send(JSON.stringify({ id, command, params }));
    });
}
export function isConnected() {
    return ws !== null && ws.readyState === WebSocket.OPEN;
}
//# sourceMappingURL=godot-bridge.js.map
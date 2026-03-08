import axios from "axios";
import { GODOT_BASE_URL, REQUEST_TIMEOUT_MS, GODOT_PLUGIN_PORT } from "../constants.js";
let client = null;
export function getGodotClient() {
    if (!client) {
        client = axios.create({
            baseURL: GODOT_BASE_URL,
            timeout: REQUEST_TIMEOUT_MS,
            headers: { "Content-Type": "application/json" }
        });
    }
    return client;
}
export async function godotRequest(method, path, body) {
    const http = getGodotClient();
    try {
        const response = await http.request({
            method,
            url: path,
            data: body
        });
        const { success, data, error } = response.data;
        if (!success || error) {
            throw new Error(error ?? "Godot plugin returned an error with no message.");
        }
        return data;
    }
    catch (err) {
        if (axios.isAxiosError(err)) {
            const axiosErr = err;
            if (axiosErr.code === "ECONNREFUSED" || axiosErr.code === "ECONNRESET") {
                throw new Error(`Cannot connect to Godot. Make sure the Claude MCP plugin is active in your Godot project ` +
                    `and listening on port ${GODOT_PLUGIN_PORT}. Enable it under Project > Project Settings > Plugins.`);
            }
            const serverMsg = axiosErr.response?.data?.error;
            if (serverMsg)
                throw new Error(serverMsg);
            throw new Error(`HTTP ${axiosErr.response?.status ?? "?"}: ${axiosErr.message}`);
        }
        throw err;
    }
}
//# sourceMappingURL=godotClient.js.map
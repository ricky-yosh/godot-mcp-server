import axios from "axios";
import { GODOT_BASE_URL, REQUEST_TIMEOUT_MS } from "../constants.js";
const client = axios.create({
    baseURL: GODOT_BASE_URL,
    timeout: REQUEST_TIMEOUT_MS,
    headers: { "Content-Type": "application/json" }
});
export async function godotRequest(method, path, body) {
    try {
        const response = await client.request({
            method,
            url: path,
            data: body
        });
        const payload = response.data;
        if (!payload.success) {
            throw new Error(payload.error ?? "Godot returned an unsuccessful response.");
        }
        return payload.data;
    }
    catch (err) {
        if (axios.isAxiosError(err)) {
            const axErr = err;
            if (axErr.code === "ECONNREFUSED") {
                throw new Error(`Cannot connect to Godot at ${GODOT_BASE_URL}. ` +
                    `Make sure the MCP Bridge plugin is enabled and the project is running ` +
                    `(Project > Tools > MCP Bridge > Start Server).`);
            }
            const serverMsg = axErr.response?.data?.error;
            throw new Error(serverMsg ?? axErr.message);
        }
        throw err;
    }
}
//# sourceMappingURL=godot-client.js.map
import axios, { AxiosInstance, AxiosError } from "axios";
import { GODOT_BASE_URL, REQUEST_TIMEOUT_MS } from "../constants.js";
import { ApiResponse } from "../types.js";

const client: AxiosInstance = axios.create({
  baseURL: GODOT_BASE_URL,
  timeout: REQUEST_TIMEOUT_MS,
  headers: { "Content-Type": "application/json" }
});

export async function godotRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  try {
    const response = await client.request<ApiResponse<T>>({
      method,
      url: path,
      data: body
    });

    const payload = response.data;
    if (!payload.success) {
      throw new Error(payload.error ?? "Godot returned an unsuccessful response.");
    }
    return payload.data as T;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const axErr = err as AxiosError<ApiResponse<unknown>>;
      if (axErr.code === "ECONNREFUSED") {
        throw new Error(
          `Cannot connect to Godot at ${GODOT_BASE_URL}. ` +
          `Make sure the MCP Bridge plugin is enabled and the project is running ` +
          `(Project > Tools > MCP Bridge > Start Server).`
        );
      }
      const serverMsg = axErr.response?.data?.error;
      throw new Error(serverMsg ?? axErr.message);
    }
    throw err;
  }
}

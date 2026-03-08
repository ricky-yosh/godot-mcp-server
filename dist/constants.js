export const GODOT_HOST = process.env.GODOT_HOST ?? "127.0.0.1";
export const GODOT_PORT = parseInt(process.env.GODOT_PORT ?? "9080");
export const GODOT_BASE_URL = `http://${GODOT_HOST}:${GODOT_PORT}`;
export const REQUEST_TIMEOUT_MS = 10_000;
export const CHARACTER_LIMIT = 8_000;
//# sourceMappingURL=constants.js.map
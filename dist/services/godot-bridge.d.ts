export interface GodotResponse {
    id: string;
    success: boolean;
    result?: unknown;
    error?: string;
}
export interface SceneNode {
    name: string;
    type: string;
    path: string;
    children?: SceneNode[];
    properties?: Record<string, unknown>;
}
export declare function sendCommand(command: string, params?: Record<string, unknown>): Promise<unknown>;
export declare function isConnected(): boolean;
//# sourceMappingURL=godot-bridge.d.ts.map
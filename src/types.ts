// ─── Godot Node / Scene Types ───────────────────────────────────────────────

export interface GodotVector2 {
  x: number;
  y: number;
}

export interface GodotVector3 {
  x: number;
  y: number;
  z: number;
}

export interface GodotTransform2D {
  position: GodotVector2;
  rotation: number;   // radians
  scale: GodotVector2;
}

export interface GodotTransform3D {
  position: GodotVector3;
  rotation: GodotVector3; // euler angles in radians
  scale: GodotVector3;
}

export interface GodotNodeInfo {
  name: string;
  type: string;
  path: string;
  children: GodotNodeInfo[];
  properties?: Record<string, unknown>;
}

export interface GodotSceneInfo {
  path: string;
  root_node: string;
  root_type: string;
  node_count: number;
}

export interface GodotResourceInfo {
  path: string;
  type: string;
  name: string;
}

export interface GodotScriptResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface GodotFileInfo {
  path: string;
  content: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

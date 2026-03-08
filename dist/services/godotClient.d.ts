import { AxiosInstance } from "axios";
export declare function getGodotClient(): AxiosInstance;
export declare function godotRequest<T>(method: "GET" | "POST" | "DELETE", path: string, body?: unknown): Promise<T>;

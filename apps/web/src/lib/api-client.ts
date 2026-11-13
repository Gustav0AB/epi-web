import type { ApiResponse } from "@epi/shared";
import { useAuthStore } from "../store/auth.store";
import { resolveOfflineGet, applyOptimisticWrite } from "./offline";
import { ApiError } from "./error-messages";

const BASE_URL = import.meta.env["VITE_API_URL"] ?? "";

type WriteMethod = "POST" | "PATCH" | "DELETE";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const method = (options.method ?? "GET").toUpperCase();

  if (!navigator.onLine) {
    if (method === "GET") {
      return resolveOfflineGet(path) as Promise<T>;
    }
    const body = options.body ? JSON.parse(options.body as string) : undefined;
    return applyOptimisticWrite(method as WriteMethod, path, body) as Promise<T>;
  }

  const token = useAuthStore.getState().token;

  return onlineRequest<T>(`${BASE_URL}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
  });
}

export async function onlineRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try { response = await fetch(path, options); }
  catch { throw new ApiError("NETWORK_ERROR"); }
  let json: ApiResponse<T>;
  try { json = await response.json(); }
  catch { throw new ApiError("INTERNAL_ERROR"); }
  if (!json || typeof json.success !== "boolean") throw new ApiError("INTERNAL_ERROR");
  if (!json.success) {
    const code = typeof json.error?.code === "string" ? json.error.code : "UNKNOWN";
    if (code === "UNAUTHORIZED") useAuthStore.getState().logout();
    throw new ApiError(code, response.status >= 500 ? undefined : json.error?.message);
  }
  if (response.ok === false) throw new ApiError("INTERNAL_ERROR");

  return json.data;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => navigator.onLine ? request<T>(path, { method: "PUT", body: JSON.stringify(body) }) : Promise.reject(new Error("Esta operación requiere conexión.")),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { ApiError };

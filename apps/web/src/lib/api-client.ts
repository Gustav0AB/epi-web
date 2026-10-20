import { ApiError, createApiClient } from "@epi/api-client";
import { useAuthStore } from "../store/auth.store";
import { resolveOfflineGet, applyOptimisticWrite } from "./offline";

const onlineClient = createApiClient({
  baseUrl: import.meta.env["VITE_API_URL"] ?? "",
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: () => useAuthStore.getState().logout(),
});

type WriteMethod = "POST" | "PATCH" | "DELETE";

async function request<T>(method: "GET" | WriteMethod, path: string, body?: unknown): Promise<T> {
  if (!navigator.onLine) {
    if (method === "GET") return resolveOfflineGet(path) as Promise<T>;
    const serialized = body === undefined ? undefined : JSON.stringify(body);
    const offlineBody = serialized === undefined ? undefined : JSON.parse(serialized);
    return applyOptimisticWrite(method, path, offlineBody) as Promise<T>;
  }

  if (method === "GET") return onlineClient.get<T>(path);
  if (method === "POST") return onlineClient.post<T>(path, body);
  if (method === "PATCH") return onlineClient.patch<T>(path, body);
  return onlineClient.delete<T>(path);
}

export const apiClient = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

export { ApiError };

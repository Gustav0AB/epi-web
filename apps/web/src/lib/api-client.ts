import type { ApiResponse } from "@epi/shared";
import { useAuthStore } from "../store/auth.store";
import { resolveOfflineGet, applyOptimisticWrite } from "./offline";

const BASE_URL = import.meta.env["VITE_API_URL"] ?? "";

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;

  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }

  return json.data;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

export { ApiError };

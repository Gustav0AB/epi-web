type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string; details?: unknown } };
import { ApiError } from "./api-error.js";

export type ApiClientOptions = {
  baseUrl?: string;
  getToken?: () => string | null;
  onUnauthorized?: () => void;
  fetcher?: typeof fetch;
};

async function request<T>(
  path: string,
  options: RequestInit,
  config: ApiClientOptions,
): Promise<T> {
  const token = config.getToken?.();
  const response = await (config.fetcher ?? ((input, init) => fetch(input, init)))(`${config.baseUrl ?? ""}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const json = (await response.json()) as ApiResponse<T>;
  if (!json.success) {
    if (json.error.code === "UNAUTHORIZED") config.onUnauthorized?.();
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }
  return json.data;
}

export function createApiClient(config: ApiClientOptions = {}) {
  return {
    get: <T>(path: string) => request<T>(path, {}, config),
    post: <T>(path: string, body: unknown) =>
      request<T>(path, { method: "POST", body: JSON.stringify(body) }, config),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, { method: "PATCH", body: JSON.stringify(body) }, config),
    delete: <T>(path: string) => request<T>(path, { method: "DELETE" }, config),
  };
}

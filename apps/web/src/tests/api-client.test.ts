import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/auth.store";
import { apiClient, ApiError } from "../lib/api-client";
import { applyOptimisticWrite, resolveOfflineGet } from "../lib/offline";

vi.mock("../lib/offline", () => ({
  resolveOfflineGet: vi.fn(),
  applyOptimisticWrite: vi.fn(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useAuthStore.setState({ token: null, isAuthenticated: false });
});

describe("apiClient", () => {
  it("sends json headers and bearer token while online", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { ok: true } }),
    });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "token-123", isAuthenticated: true });

    await expect(apiClient.post("/api/demo", { name: "EPI" })).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/demo", {
      method: "POST",
      body: JSON.stringify({ name: "EPI" }),
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer token-123",
      },
    });
  });

  it("throws ApiError when the API returns an error envelope", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: { code: "BAD_REQUEST", message: "Nope" } }),
      })
    );

    await expect(apiClient.get("/api/demo")).rejects.toMatchObject({
      name: "ApiError",
      code: "BAD_REQUEST",
      message: "Nope",
    });
  });

  it("logs out on unauthorized API errors", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: { code: "UNAUTHORIZED", message: "Expired" } }),
      })
    );
    useAuthStore.setState({ token: "token-123", isAuthenticated: true });

    await expect(apiClient.get("/api/demo")).rejects.toThrow("Expired");

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().token).toBeNull();
  });

  it("supports DELETE requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { deleted: true } }),
    });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiClient.delete("/api/demo/1")).resolves.toEqual({ deleted: true });

    expect(fetchMock).toHaveBeenCalledWith("/api/demo/1", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
    });
  });

  it("uses offline reads and optimistic writes while offline", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(resolveOfflineGet).mockResolvedValue({ cached: true });
    vi.mocked(applyOptimisticWrite).mockResolvedValue({ queued: true });

    await expect(apiClient.get("/api/users")).resolves.toEqual({ cached: true });
    await expect(apiClient.patch("/api/users/1", { name: "Ana" })).resolves.toEqual({ queued: true });

    expect(resolveOfflineGet).toHaveBeenCalledWith("/api/users");
    expect(applyOptimisticWrite).toHaveBeenCalledWith("PATCH", "/api/users/1", { name: "Ana" });
    expect(fetch).not.toHaveBeenCalled();
  });
});

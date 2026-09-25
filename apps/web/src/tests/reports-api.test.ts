import { afterEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/auth.store";
import { reportsApi } from "../features/reports/api";

afterEach(() => {
  vi.unstubAllGlobals();
  useAuthStore.setState({ token: null });
});

describe("reportsApi", () => {
  it("fetches assigned reports with status and bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "token-123" });

    await expect(reportsApi.assigned("published")).resolves.toEqual([]);

    expect(fetchMock).toHaveBeenCalledWith("/api/reports/assigned?status=published", {
      headers: { Authorization: "Bearer token-123" },
    });
  });

  it("omits empty siteId when fetching report data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { kpis: {}, series: {}, tables: {}, texts: {} } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await reportsApi.data("report-1", "");

    expect(fetchMock).toHaveBeenCalledWith("/api/reports/report-1/data", { headers: {} });
  });

  it("adds siteId when fetching scoped report data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: { kpis: {}, series: {}, tables: {}, texts: {} } }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await reportsApi.data("report-1", "site-1");

    expect(fetchMock).toHaveBeenCalledWith("/api/reports/report-1/data?siteId=site-1", { headers: {} });
  });

  it("throws the API error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: { message: "No access" } }),
      })
    );

    await expect(reportsApi.assigned()).rejects.toThrow("No access");
  });
});

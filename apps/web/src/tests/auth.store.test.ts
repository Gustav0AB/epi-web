import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@epi/shared";
import { useAuthStore } from "../store/auth.store";
import { seedDatabase } from "../lib/seed";

vi.mock("../lib/seed", () => ({
  seedDatabase: vi.fn(),
  clearDatabase: vi.fn(),
}));

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Ana Demo",
  username: "ana_demo",
  email: "ana@example.com",
  role: "functionality_user",
  institutionalPosition: null,
  isActive: true,
  featureKeys: [],
  reportTemplateKeys: [],
  organizationId: "22222222-2222-4222-8222-222222222222",
  siteIds: [],
  excludedSiteIds: [],
  excludedSurveyDefinitionIds: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function tokenWith(payload: unknown): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  useAuthStore.setState({ token: null, isAuthenticated: false, currentUser: null, isUserLoading: false });
});

describe("useAuthStore", () => {
  it("logs in, stores the token, loads the user, and seeds local data", async () => {
    const token = tokenWith({ sub: user.id, role: user.role });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: { accessToken: token, tokenType: "Bearer", expiresIn: 3600, mustChangePassword: true } }),
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ success: true, data: user }),
      });
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", fetchMock);

    await useAuthStore.getState().login({ username: "ana_demo", password: "password123" });

    expect(useAuthStore.getState()).toMatchObject({
      token,
      isAuthenticated: true,
      isLoading: false,
      currentUser: user,
      mustChangePassword: true,
    });
    expect(seedDatabase).toHaveBeenCalledWith(token);
  });

  it("stores login errors and can clear them", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: { code: "UNAUTHORIZED", message: "Bad login" } }),
      })
    );

    await expect(useAuthStore.getState().login({ username: "ana_demo", password: "bad" })).rejects.toThrow("Bad login");

    expect(useAuthStore.getState()).toMatchObject({ error: "Bad login", isLoading: false });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });

  it("logs out and clears persisted auth state", async () => {
    useAuthStore.setState({ token: "token-123", isAuthenticated: true, error: "x", currentUser: user, mustChangePassword: true });

    useAuthStore.getState().logout();

    expect(useAuthStore.getState()).toMatchObject({
      token: null,
      isAuthenticated: false,
      error: null,
      currentUser: null,
      mustChangePassword: false,
    });
  });

  it("loads the current user from the token subject", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ success: true, data: user }),
    });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: tokenWith({ sub: user.id, role: user.role }), currentUser: null });

    await useAuthStore.getState().initCurrentUser();

    expect(fetchMock).toHaveBeenCalledWith(`/api/users/${user.id}`, {
      headers: { Authorization: `Bearer ${useAuthStore.getState().token}` },
    });
    expect(useAuthStore.getState().currentUser).toEqual(user);
    expect(useAuthStore.getState().isUserLoading).toBe(false);
  });

  it("does nothing when the token cannot be decoded", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "broken", currentUser: null });

    await useAuthStore.getState().initCurrentUser();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(useAuthStore.getState().currentUser).toBeNull();
    expect(useAuthStore.getState().isUserLoading).toBe(false);
  });
});

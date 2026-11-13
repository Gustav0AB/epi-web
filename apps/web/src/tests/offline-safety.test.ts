import { afterEach, describe, expect, it, vi } from "vitest";
import { applyOptimisticWrite } from "../lib/offline";
import { initSync } from "../lib/sync";
import { useAuthStore } from "../store/auth.store";
import { db } from "../lib/db";

vi.mock("../lib/db", () => ({ db: {
  users: { add: vi.fn(), delete: vi.fn(), put: vi.fn() },
  mutationQueue: { add: vi.fn(), delete: vi.fn(), orderBy: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([{ id: 1, method: "PATCH", path: "/api/users/u", body: { isActive: false } }]) })) },
} }));
vi.mock("../lib/seed", () => ({ seedDatabase: vi.fn().mockResolvedValue(undefined), clearDatabase: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); useAuthStore.setState({ token: null }); });

describe("seguridad sin conexión", () => {
  it("impide guardar contraseñas de nuevos usuarios en el navegador", async () => {
    await expect(applyOptimisticWrite("POST", "/api/users", { username: "ana", password: "secret" })).rejects.toThrow(/internet/);
    await expect(applyOptimisticWrite("PATCH", "/api/users/u", { password: "secret" })).rejects.toThrow(/internet/);
    expect(db.users.add).not.toHaveBeenCalled(); expect(db.mutationQueue.add).not.toHaveBeenCalled();
  });
  it("sincroniza con la sesión activa al recuperar conexión", async () => {
    let online: (() => void) | undefined;
    vi.stubGlobal("window", { addEventListener: (_name: string, callback: () => void) => { online = callback; } });
    const fetchMock = vi.fn().mockResolvedValue({ json: async () => ({ success: true, data: {} }) });
    vi.stubGlobal("fetch", fetchMock);
    useAuthStore.setState({ token: "sesion-actual" });
    initSync(); online?.();
    await vi.waitFor(() => expect(db.mutationQueue.delete).toHaveBeenCalledWith(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/users/u", expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer sesion-actual" }) }));
  });
});

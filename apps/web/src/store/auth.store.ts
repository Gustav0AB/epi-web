import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthToken, LoginDto, User } from "@epi/shared";

type AuthState = {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  currentUser: User | null;
};

type AuthActions = {
  login: (dto: LoginDto) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  initCurrentUser: () => Promise<void>;
};

function decodeJwtPayload(token: string): { sub: string; role: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    return JSON.parse(atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

async function fetchCurrentUser(token: string): Promise<User | null> {
  const payload = decodeJwtPayload(token);
  if (!payload?.sub) return null;
  try {
    const res = await fetch(`/api/users/${payload.sub}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    return json.success ? (json.data as User) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      currentUser: null,

      login: async (dto) => {
        set({ isLoading: true, error: null });
        try {
          const { apiClient } = await import("../lib/api-client");
          const data = await apiClient.post<AuthToken>("/api/auth/login", dto);
          const currentUser = await fetchCurrentUser(data.accessToken);
          set({ token: data.accessToken, isAuthenticated: true, isLoading: false, currentUser });

          const { seedDatabase } = await import("../lib/seed");
          await seedDatabase(data.accessToken);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Login failed";
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      logout: () => {
        void import("./users.store").then(({ useUsersStore }) => {
          useUsersStore.getState().reset();
        });
        void import("../lib/seed").then(({ clearDatabase }) => clearDatabase());
        set({ token: null, isAuthenticated: false, error: null, currentUser: null });
      },

      clearError: () => set({ error: null }),

      initCurrentUser: async () => {
        const { token, currentUser } = get();
        if (!token || currentUser) return;
        const user = await fetchCurrentUser(token);
        if (user) set({ currentUser: user });
      },
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);

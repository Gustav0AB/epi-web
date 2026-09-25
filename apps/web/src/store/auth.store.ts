import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { AuthToken, LoginDto, User } from "@epi/shared";

type AuthState = {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isUserLoading: boolean;
  error: string | null;
  currentUser: User | null;
  mustChangePassword: boolean;
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
      isUserLoading: false,
      error: null,
      currentUser: null,
      mustChangePassword: false,

      login: async (dto) => {
        set({ isLoading: true, error: null });
        try {
          const { apiClient } = await import("../lib/api-client");
          const data = await apiClient.post<AuthToken>("/api/auth/login", dto);
          const currentUser = await fetchCurrentUser(data.accessToken);
          set({ token: data.accessToken, isAuthenticated: true, isLoading: false, currentUser, mustChangePassword: data.mustChangePassword });

          const { seedDatabase } = await import("../lib/seed");
          await seedDatabase(data.accessToken);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Login failed";
          set({ error: message, isLoading: false });
          throw err;
        }
      },

      logout: () => {
        void import("../lib/seed").then(({ clearDatabase }) => clearDatabase());
        set({ token: null, isAuthenticated: false, error: null, currentUser: null, mustChangePassword: false });
      },

      clearError: () => set({ error: null }),

      initCurrentUser: async () => {
        const { token, currentUser } = get();
        if (!token || currentUser) return;
        set({ isUserLoading: true });
        const user = await fetchCurrentUser(token);
        set({ currentUser: user, isUserLoading: false });
      },
    }),
    {
      name: "auth-storage",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({ token: state.token, isAuthenticated: state.isAuthenticated, mustChangePassword: state.mustChangePassword }),
    }
  )
);

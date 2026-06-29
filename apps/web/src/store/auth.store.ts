import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthToken, LoginDto } from "@epi/shared";

type AuthState = {
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
};

type AuthActions = {
  login: (dto: LoginDto) => Promise<void>;
  logout: () => void;
  clearError: () => void;
};

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      login: async (dto) => {
        set({ isLoading: true, error: null });
        try {
          const { apiClient } = await import("../lib/api-client");
          const data = await apiClient.post<AuthToken>("/api/auth/login", dto);
          set({ token: data.accessToken, isAuthenticated: true, isLoading: false });

          // Seed IndexedDB so the app can work offline from this point on
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
        set({ token: null, isAuthenticated: false, error: null });
      },
      clearError: () => set({ error: null }),
    }),
    {
      name: "auth-storage",
      partialize: (state) => ({ token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);

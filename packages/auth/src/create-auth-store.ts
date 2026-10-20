import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { AuthResult, AuthStore } from "./types.js";

export type AuthStoreOptions<User, Credentials> = {
  authenticate: (credentials: Credentials) => Promise<AuthResult<User>>;
  loadCurrentUser: (token: string) => Promise<User | null>;
  onLogin?: (token: string) => Promise<void>;
  onLogout?: () => void;
  storage?: StateStorage;
  storageKey: string;
};

export function createAuthStore<User, Credentials>({
  authenticate,
  loadCurrentUser,
  onLogin,
  onLogout,
  storage,
  storageKey,
}: AuthStoreOptions<User, Credentials>) {
  return create<AuthStore<User, Credentials>>()(
    persist(
      (set, get) => ({
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isUserLoading: false,
        error: null,
        currentUser: null,
        mustChangePassword: false,

        login: async (credentials) => {
          set({ isLoading: true, error: null });
          try {
            const result = await authenticate(credentials);
            set({
              token: result.token,
              isAuthenticated: true,
              isLoading: false,
              currentUser: result.currentUser,
              mustChangePassword: result.mustChangePassword ?? false,
            });
            await onLogin?.(result.token);
          } catch (err) {
            const message = err instanceof Error ? err.message : "Login failed";
            set({ error: message, isLoading: false });
            throw err;
          }
        },

        logout: () => {
          onLogout?.();
          set({ token: null, isAuthenticated: false, error: null, currentUser: null, mustChangePassword: false });
        },

        clearError: () => set({ error: null }),

        initCurrentUser: async () => {
          const { token, currentUser } = get();
          if (!token || currentUser) return;
          set({ isUserLoading: true });
          const user = await loadCurrentUser(token);
          set({ currentUser: user, isUserLoading: false });
        },
      }),
      {
        name: storageKey,
        storage: createJSONStorage(() => storage ?? sessionStorage),
        partialize: (state) => ({
          token: state.token,
          isAuthenticated: state.isAuthenticated,
          mustChangePassword: state.mustChangePassword,
        }),
      },
    ),
  );
}

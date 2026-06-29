import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { User, PaginationMeta, PaginationQuery } from "@epi/shared";
import { apiClient } from "../lib/api-client";

type UsersState = {
  users: User[];
  selectedUser: User | null;
  meta: PaginationMeta | null;
  isLoading: boolean;
  error: string | null;
};

type UsersActions = {
  fetchUsers: (pagination?: PaginationQuery) => Promise<void>;
  fetchUserById: (id: string) => Promise<void>;
  createUser: (dto: Omit<User, "id" | "createdAt" | "updatedAt"> & { password: string }) => Promise<void>;
  updateUser: (id: string, dto: Partial<Pick<User, "name" | "email" | "role">>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  selectUser: (user: User | null) => void;
  clearError: () => void;
  reset: () => void;
};

export const useUsersStore = create<UsersState & UsersActions>()(
  devtools(
    (set, get) => ({
      users: [],
      selectedUser: null,
      meta: null,
      isLoading: false,
      error: null,

      fetchUsers: async (pagination = {}) => {
        set({ isLoading: true, error: null });
        try {
          const { page = 1, pageSize = 20 } = pagination;
          const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
          // The full ApiResponse with meta is returned from the server
          // Our api-client strips the wrapper and returns data — but we need meta too.
          // We use a raw fetch here so we can access both data and meta.
          const response = await fetch(`/api/users?${params}`, {
            headers: { Authorization: `Bearer ${useAuthStore_getToken()}` },
          });
          const json = await response.json();
          if (!json.success) throw new Error(json.error.message);
          set({ users: json.data as User[], meta: json.meta ?? null, isLoading: false });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Failed to fetch users", isLoading: false });
        }
      },

      fetchUserById: async (id) => {
        set({ isLoading: true, error: null });
        try {
          const user = await apiClient.get<User>(`/api/users/${id}`);
          set({ selectedUser: user, isLoading: false });
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "User not found", isLoading: false });
        }
      },

      createUser: async (dto) => {
        set({ isLoading: true, error: null });
        try {
          const user = await apiClient.post<User>("/api/users", dto);
          set((s) => ({ users: [user, ...s.users], isLoading: false }));
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Failed to create user", isLoading: false });
          throw err;
        }
      },

      updateUser: async (id, dto) => {
        set({ isLoading: true, error: null });
        try {
          const updated = await apiClient.patch<User>(`/api/users/${id}`, dto);
          set((s) => ({
            users: s.users.map((u) => (u.id === id ? updated : u)),
            selectedUser: s.selectedUser?.id === id ? updated : s.selectedUser,
            isLoading: false,
          }));
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Failed to update user", isLoading: false });
          throw err;
        }
      },

      deleteUser: async (id) => {
        set({ isLoading: true, error: null });
        try {
          await apiClient.delete(`/api/users/${id}`);
          set((s) => ({
            users: s.users.filter((u) => u.id !== id),
            selectedUser: s.selectedUser?.id === id ? null : s.selectedUser,
            isLoading: false,
          }));
        } catch (err) {
          set({ error: err instanceof Error ? err.message : "Failed to delete user", isLoading: false });
          throw err;
        }
      },

      selectUser: (user) => set({ selectedUser: user }),
      clearError: () => set({ error: null }),
      reset: () => set({ users: [], selectedUser: null, meta: null, isLoading: false, error: null }),
    }),
    { name: "UsersStore" }
  )
);

// Avoid importing auth store at module level to prevent circular deps
function useAuthStore_getToken(): string {
  // Dynamic import trick: read from localStorage where the auth store persists
  try {
    const raw = localStorage.getItem("auth-storage");
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed?.state?.token ?? "";
  } catch {
    return "";
  }
}

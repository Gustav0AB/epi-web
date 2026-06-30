import { useEffect, useState, useCallback } from "react";
import { FEATURES_REGISTRY } from "@epi/shared";
import type { User, CreateUserDto } from "@epi/shared";
import { Badge, Button, Table } from "../../shared/components";
import type { Column } from "../../shared/components";
import { useAuthStore } from "../../store/auth.store";
import { CreateUserModal } from "./components/CreateUserModal";

type ApiListResponse<T> = { success: true; data: T[] };

async function apiFetch<T>(path: string, token: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...options?.headers },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message ?? "Request failed");
  return json.data as T;
}

export function UsersPage() {
  const { token, currentUser } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const isAdmin = currentUser?.role === "admin";

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await apiFetch<ApiListResponse<User>>("/api/users", token);
      setUsers((data as unknown as User[]) ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleCreate(dto: CreateUserDto) {
    if (!token) return;
    await apiFetch<User>("/api/users", token, {
      method: "POST",
      body: JSON.stringify(dto),
    });
    await loadUsers();
  }

  const columns: Column<User>[] = [
    { key: "name", header: "Name" },
    { key: "username", header: "Username", render: (u) => <span className="font-mono text-sm">{u.username}</span> },
    { key: "email", header: "Email" },
    {
      key: "role",
      header: "Role",
      render: (u) => (
        <Badge color={u.role === "admin" ? "blue" : "gray"}>
          {u.role === "admin" ? "Admin" : "User"}
        </Badge>
      ),
    },
    {
      key: "featureKeys",
      header: "Features",
      render: (u) => {
        if (u.role === "admin") return <span className="text-xs text-gray-400">All features</span>;
        if (!u.featureKeys.length) return <span className="text-xs text-gray-400">None</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {u.featureKeys.map((k) => (
              <Badge key={k} color="green">
                {FEATURES_REGISTRY[k as keyof typeof FEATURES_REGISTRY]?.name ?? k}
              </Badge>
            ))}
          </div>
        );
      },
    },
  ];

  if (!isAdmin) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">User Management</h1>
          <p className="mt-0.5 text-sm text-gray-500">Manage users and their feature access.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>Add User</Button>
      </div>

      <Table
        columns={columns}
        rows={users}
        keyExtractor={(u) => u.id}
        loading={loading}
        emptyText="No users found."
      />

      <CreateUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />
    </div>
  );
}

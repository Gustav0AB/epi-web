import { useEffect, useState, useCallback } from "react";
import { FEATURES_REGISTRY } from "@epi/shared";
import type { User, CreateUserDto, Role } from "@epi/shared";
import { Badge, Button, Label, Table } from "../../shared/components";
import type { Column } from "../../shared/components";
import { useAuthStore } from "../../store/auth.store";
import { apiClient } from "../../lib/api-client";
import { CreateUserModal } from "./components/CreateUserModal";
import { ResetPasswordModal } from "./components/ResetPasswordModal";
import { useI18n } from "../../lib/i18n";

export function UsersPage() {
  const { t } = useI18n();
  const roleBadge: Record<Role, { label: string; color: "blue" | "purple" | "green" | "gray" }> = {
    system_admin: { label: t("users.role.systemAdmin"), color: "purple" },
    org_admin: { label: t("users.role.orgAdmin"), color: "blue" },
    report_viewer: { label: t("users.role.reportViewer"), color: "green" },
    functionality_user: { label: t("users.role.functionalityUser"), color: "gray" },
  };
  const { currentUser, isUserLoading } = useAuthStore();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);

  const canManageUsers = currentUser?.role === "system_admin" || currentUser?.role === "org_admin";

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await apiClient.get<User[]>("/api/users"));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function handleResetPassword(password: string) {
    if (!resetPasswordUser) return;
    await apiClient.post<void>(`/api/users/${resetPasswordUser.id}/reset-password`, { password });
  }

  async function handleCreate(dto: CreateUserDto) {
    await apiClient.post<User>("/api/users", dto);
    await loadUsers();
  }

  async function toggleActive(user: User) {
    await apiClient.patch<User>(`/api/users/${user.id}`, { isActive: !user.isActive });
    await loadUsers();
  }

  async function forceLogout(user: User) {
    await apiClient.post<void>(`/api/users/${user.id}/force-logout`, {});
  }

  const columns: Column<User>[] = [
    { key: "name", header: t("users.table.name") },
    { key: "username", header: t("users.table.username"), render: (u) => <span className="font-mono text-sm">{u.username}</span> },
    { key: "email", header: t("users.table.email") },
    {
      key: "institutionalPosition",
      header: t("users.table.institutionalPosition"),
      render: (u) => u.institutionalPosition || <span className="text-xs text-gray-400">{t("users.none")}</span>,
    },
    {
      key: "role",
      header: t("users.table.role"),
      render: (u) => <Badge color={roleBadge[u.role].color}>{roleBadge[u.role].label}</Badge>,
    },
    {
      key: "isActive",
      header: t("common.status"),
      render: (u) => (
        <Badge color={u.isActive ? "green" : "red"}>{u.isActive ? t("common.active") : t("common.inactive")}</Badge>
      ),
    },
    {
      key: "featureKeys",
      header: t("users.table.permissions"),
      render: (u) => {
        if (u.role === "system_admin" || u.role === "org_admin") {
          return <span className="text-xs text-gray-400">{t("users.fullAccess")}</span>;
        }
        const keys = u.role === "report_viewer" ? u.reportTemplateKeys : u.featureKeys;
        if (!keys.length) return <span className="text-xs text-gray-400">{t("users.none")}</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {keys.map((k) => (
              <Badge key={k} color="green">
                {FEATURES_REGISTRY[k as keyof typeof FEATURES_REGISTRY]?.name ?? k}
              </Badge>
            ))}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(u)}>
            {u.isActive ? t("common.deactivate") : t("common.activate")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setResetPasswordUser(u)}>
            {t("users.resetPassword")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void forceLogout(u)}>
            {t("users.forceLogout")}
          </Button>
        </div>
      ),
    },
  ];

  if (isUserLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{t("table.loading")}</p>
      </div>
    );
  }

  if (!canManageUsers) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-gray-500">{t("users.noPermission")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label variant="title" className="block">{t("users.title")}</Label>
          <p className="mt-0.5 text-sm text-gray-500">{t("users.subtitle")}</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>{t("users.addUser")}</Button>
      </div>

      <Table
        columns={columns}
        rows={users}
        keyExtractor={(u) => u.id}
        loading={loading}
        emptyText={t("users.table.empty")}
        pageSize={25}
      />

      <CreateUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleCreate}
      />

      <ResetPasswordModal
        open={!!resetPasswordUser}
        userName={resetPasswordUser?.name ?? ""}
        onClose={() => setResetPasswordUser(null)}
        onSubmit={handleResetPassword}
      />
    </div>
  );
}

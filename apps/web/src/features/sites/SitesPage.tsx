import { useCallback, useEffect, useState } from "react";
import type { OrganizationDto, SiteDto } from "@epi/shared";
import { Badge, Button, ConfirmModal, Dropdown, Label, Modal, Table, TextField } from "../../shared/components";
import type { Column, DropdownOption } from "../../shared/components";
import { apiClient } from "../../lib/api-client";
import { useAuthStore } from "../../store/auth.store";
import { useI18n } from "../../lib/i18n";

export function SitesPage() {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isSystemAdmin = currentUser?.role === "system_admin";

  const [sites, setSites] = useState<SiteDto[]>([]);
  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SiteDto | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<SiteDto | null>(null);
  const [name, setName] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, o] = await Promise.all([
        apiClient.get<SiteDto[]>("/api/sites"),
        isSystemAdmin ? apiClient.get<OrganizationDto[]>("/api/organizations") : Promise.resolve([]),
      ]);
      setSites(s);
      setOrgs(o);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [isSystemAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const orgNameById = new Map(orgs.map((o) => [o.id, o.name]));
  const orgOptions: DropdownOption[] = [
    { label: t("createUserModal.noOrganization"), value: "" },
    ...orgs.map((o) => ({ label: o.name, value: o.id })),
  ];

  function openCreate() {
    setEditing(null);
    setName("");
    setOrganizationId("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(site: SiteDto) {
    setEditing(site);
    setName(site.name);
    setOrganizationId(site.organizationId ?? "");
    setError(null);
    setModalOpen(true);
  }

  async function toggleActive(site: SiteDto) {
    await apiClient.patch(`/api/sites/${site.id}`, { isActive: !site.isActive });
    await load();
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body = isSystemAdmin
        ? { name: name.trim(), organizationId: organizationId || null }
        : { name: name.trim() };
      if (editing) {
        await apiClient.patch(`/api/sites/${editing.id}`, body);
      } else {
        await apiClient.post("/api/sites", body);
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<SiteDto>[] = [
    { key: "name", header: t("users.table.name") },
    ...(isSystemAdmin
      ? [
          {
            key: "organizationId",
            header: t("createUserModal.organization"),
            render: (s: SiteDto) => (s.organizationId ? orgNameById.get(s.organizationId) ?? "—" : "—"),
          } as Column<SiteDto>,
        ]
      : []),
    {
      key: "isActive",
      header: t("common.status"),
      render: (s) => (
        <Badge color={s.isActive ? "green" : "red"}>{s.isActive ? t("common.active") : t("common.inactive")}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (s) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(s)}>
            {t("common.edit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(s)}>
            {s.isActive ? t("common.deactivate") : t("common.activate")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleting(s)}>
            {t("common.delete")}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Label variant="title" className="block">{t("sites.title")}</Label>
          <p className="mt-0.5 text-sm text-gray-500">{t("sites.subtitle")}</p>
        </div>
        <Button onClick={openCreate}>{t("sites.add")}</Button>
      </div>

      <Table
        columns={columns}
        rows={sites}
        keyExtractor={(s) => s.id}
        loading={loading}
        emptyText={t("settings.sites.empty")}
        pageSize={25}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("sites.editTitle") : t("sites.addTitle")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button loading={saving} onClick={handleSave}>
              {t("common.save")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField
            label={t("users.table.name")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Baja California Sur"
          />
          {isSystemAdmin && (
            <Dropdown
              label={t("createUserModal.organization")}
              options={orgOptions}
              value={organizationId}
              onChange={setOrganizationId}
            />
          )}
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title={t("sites.deleteTitle")}
        message={t("sites.deleteMessage").replace("{name}", deleting?.name ?? "")}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await apiClient.delete(`/api/sites/${deleting!.id}`);
          await load();
        }}
      />
    </div>
  );
}

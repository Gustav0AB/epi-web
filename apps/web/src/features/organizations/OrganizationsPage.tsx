import { useCallback, useEffect, useState } from "react";
import type { OrganizationDto } from "@epi/shared";
import { Badge, Button, ConfirmModal, Label, Modal, Table, TextField } from "../../shared/components";
import type { Column } from "../../shared/components";
import { apiClient } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

export function OrganizationsPage() {
  const { t } = useI18n();
  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OrganizationDto | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState<OrganizationDto | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrgs(await apiClient.get<OrganizationDto[]>("/api/organizations"));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(org: OrganizationDto) {
    setEditing(org);
    setName(org.name);
    setError(null);
    setModalOpen(true);
  }

  async function toggleActive(org: OrganizationDto) {
    await apiClient.patch(`/api/organizations/${org.id}`, { isActive: !org.isActive });
    await load();
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiClient.patch(`/api/organizations/${editing.id}`, { name: name.trim() });
      } else {
        await apiClient.post("/api/organizations", { name: name.trim() });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  const columns: Column<OrganizationDto>[] = [
    { key: "name", header: t("users.table.name") },
    {
      key: "isActive",
      header: t("common.status"),
      render: (o) => (
        <Badge color={o.isActive ? "green" : "red"}>{o.isActive ? t("common.active") : t("common.inactive")}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (o) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => openEdit(o)}>
            {t("common.edit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(o)}>
            {o.isActive ? t("common.deactivate") : t("common.activate")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleting(o)}>
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
          <Label variant="title" className="block">{t("organizations.title")}</Label>
          <p className="mt-0.5 text-sm text-gray-500">{t("organizations.subtitle")}</p>
        </div>
        <Button onClick={openCreate}>{t("organizations.add")}</Button>
      </div>

      <Table
        columns={columns}
        rows={orgs}
        keyExtractor={(o) => o.id}
        loading={loading}
        emptyText={t("settings.orgs.empty")}
        pageSize={25}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? t("organizations.editTitle") : t("organizations.addTitle")}
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
        <TextField
          label={t("users.table.name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ecology Project International"
        />
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title={t("organizations.deleteTitle")}
        message={t("organizations.deleteMessage").replace("{name}", deleting?.name ?? "")}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await apiClient.delete(`/api/organizations/${deleting!.id}`);
          await load();
        }}
      />
    </div>
  );
}

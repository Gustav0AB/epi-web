import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import type { OrganizationDto, SiteDto } from "@epi/shared";
import { Badge, Button, ConfirmModal, Dropdown, Label, Modal, Table, TextField } from "@epi/ui";
import type { Column, DropdownOption } from "@epi/ui";
import { apiClient } from "../../lib/api-client";
import { useAuthStore } from "../../store/auth.store";
import { useI18n } from "../../lib/i18n";

export function SitesPage() {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isSystemAdmin = currentUser?.role === "system_admin";

  const [params, setParams] = useSearchParams();
  const filterOrganization = isSystemAdmin ? params.get("organizationId") ?? "" : "";
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SiteDto | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [duplicateTarget, setDuplicateTarget] = useState<SiteDto | null>(null);
  const [catalogSources, setCatalogSources] = useState<SiteDto[]>([]);
  const [sourceSite, setSourceSite] = useState("");
  const [duplicateError, setDuplicateError] = useState<string | null>(null);
  const [duplicateBusy, setDuplicateBusy] = useState(false);
  const [deleting, setDeleting] = useState<SiteDto | null>(null);
  const [name, setName] = useState("");
  const [programs, setPrograms] = useState("Local, Visiting, Otro");
  const [activityTypes, setActivityTypes] = useState("");
  const [activities, setActivities] = useState("");
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
    setPrograms("Local, Visiting, Otro"); setActivityTypes(""); setActivities("");
    setName("");
    setOrganizationId(filterOrganization);
    setError(null);
    setModalOpen(true);
  }

  function openEdit(site: SiteDto) {
    setEditing(site);
    setPrograms((site.programs ?? []).join(", ")); setActivityTypes((site.activityTypes ?? []).join(", ")); setActivities((site.activities ?? []).join(", "));
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
      const catalog = { programs: programs.split(",").map(value => value.trim()).filter(Boolean), activityTypes: activityTypes.split(",").map(value => value.trim()).filter(Boolean), activities: activities.split(",").map(value => value.trim()).filter(Boolean) };
      const body = isSystemAdmin
        ? { name: name.trim(), organizationId: organizationId || null, ...catalog }
        : { name: name.trim(), ...catalog };
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

  async function openDuplicate(site: SiteDto) {
    setDuplicateTarget(site); setSourceSite(""); setCatalogSources([]); setDuplicateError(null); setDuplicateBusy(true);
    try { setCatalogSources(await apiClient.get<SiteDto[]>(`/api/sites/${encodeURIComponent(site.id)}/catalog-sources`)); }
    catch (reason) { setDuplicateError(reason instanceof Error ? reason.message : "No se pudieron cargar los sitios"); }
    finally { setDuplicateBusy(false); }
  }
  async function duplicateCatalogs() {
    if (!duplicateTarget || !sourceSite) return;
    setDuplicateBusy(true); setDuplicateError(null);
    try { await apiClient.post(`/api/sites/${encodeURIComponent(duplicateTarget.id)}/duplicate-catalogs`, { sourceSiteId: sourceSite }); setDuplicateTarget(null); await load(); }
    catch (reason) { setDuplicateError(reason instanceof Error ? reason.message : "No se pudieron duplicar los catálogos"); }
    finally { setDuplicateBusy(false); }
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
          <Button variant="ghost" size="sm" onClick={() => void openDuplicate(s)}>Duplicar catálogos</Button>
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

      {isSystemAdmin && <Dropdown label="Filtrar sitios por organización" value={filterOrganization} options={[{ value: "", label: "Todas las organizaciones" }, ...orgs.map(org => ({ value: org.id, label: org.name }))]} onChange={id => setParams(id ? { organizationId: id } : {})} />}
      <Table
        columns={columns}
        rows={filterOrganization ? sites.filter(site => site.organizationId === filterOrganization) : sites}
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
          <TextField label="Programas (separados por coma; incluir Otro)" value={programs} onChange={event => setPrograms(event.target.value)} />
          <TextField label="Actividades (separadas por coma)" value={activities} onChange={event => setActivities(event.target.value)} />
          <TextField label="Tipos de actividad (separados por coma)" value={activityTypes} onChange={event => setActivityTypes(event.target.value)} />
          <p className="text-sm text-gray-500">Estas opciones estarán disponibles únicamente en este sitio. Cambiar el catálogo no modifica instrumentos ya registrados.</p>
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

      <Modal open={!!duplicateTarget} onClose={() => { if (!duplicateBusy) setDuplicateTarget(null); }} title="Duplicar catálogos" footer={<><Button variant="ghost" disabled={duplicateBusy} onClick={() => setDuplicateTarget(null)}>Cancelar</Button><Button loading={duplicateBusy} disabled={!sourceSite} onClick={() => void duplicateCatalogs()}>Duplicar</Button></>}>
        <p className="mb-3">Destino: {duplicateTarget?.name}. Se agregarán los programas, actividades y tipos de actividad del sitio elegido; se conservarán las opciones existentes.</p>
        <Dropdown label="Sitio de origen" value={sourceSite} options={[{ value: "", label: "Selecciona un sitio" }, ...catalogSources.map(site => ({ value: site.id, label: site.name }))]} onChange={setSourceSite} />
        {!duplicateBusy && !catalogSources.length && <p>No hay otros sitios activos disponibles en esta organización.</p>}
        {duplicateError && <p role="alert" className="text-danger">{duplicateError}</p>}
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

import { useEffect, useState } from "react";
import { FEATURES_REGISTRY } from "@epi/shared";
import { Button, Dropdown, Modal, TextField } from "../../../shared/components";
import type { DropdownOption } from "../../../shared/components";
import type {
  ApiResponse,
  CreateUserDto,
  InstitutionalPositionDto,
  OrganizationDto,
  SiteDto,
  ReportTemplate,
  Role,
  SurveyDefinitionDto,
} from "@epi/shared";
import { useAuthStore } from "../../../store/auth.store";
import { useI18n } from "../../../lib/i18n";

const OTHER_POSITION_VALUE = "__other__";

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (dto: CreateUserDto) => Promise<void>;
};

const initialForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "functionality_user" as Role,
  featureKeys: [] as string[],
  reportTemplateKeys: [] as string[],
  organizationId: "",
  siteIds: [] as string[],
  excludedSiteIds: [] as string[],
  excludedSurveyDefinitionIds: [] as string[],
};

async function fetchList<T>(path: string): Promise<T[]> {
  const token = useAuthStore.getState().token;
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const json = (await res.json()) as ApiResponse<T[]>;
  return json.success ? json.data : [];
}

export function CreateUserModal({ open, onClose, onSubmit }: Props) {
  const { t } = useI18n();
  const currentUser = useAuthStore((s) => s.currentUser);
  const isSystemAdmin = currentUser?.role === "system_admin";

  const roleLabels: Record<Role, string> = {
    system_admin: t("users.role.systemAdmin"),
    org_admin: t("users.role.orgAdmin"),
    report_viewer: t("users.role.reportViewer"),
    functionality_user: t("users.role.functionalityUser"),
  };

  const roleOptions: DropdownOption[] = (
    isSystemAdmin
      ? (["system_admin", "org_admin", "report_viewer", "functionality_user"] as const)
      : (["report_viewer", "functionality_user"] as const)
  ).map((r) => ({ value: r, label: roleLabels[r] }));

  const [form, setForm] = useState(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orgs, setOrgs] = useState<OrganizationDto[]>([]);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [surveyDefinitions, setSurveyDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [institutionalPositions, setInstitutionalPositions] = useState<InstitutionalPositionDto[]>([]);
  const [positionSelection, setPositionSelection] = useState("");
  const [customPosition, setCustomPosition] = useState("");

  useEffect(() => {
    if (!open) return;
    void fetchList<OrganizationDto>("/api/organizations").then(setOrgs);
    void fetchList<ReportTemplate>("/api/report-templates").then(setReportTemplates);
    void fetchList<SurveyDefinitionDto>("/api/surveys/definitions").then(setSurveyDefinitions);
    void fetchList<InstitutionalPositionDto>("/api/institutional-positions").then(setInstitutionalPositions);
  }, [open]);

  // Solo los sitios de la organización seleccionada — se re-consulta cada
  // vez que cambia (system_admin puede cambiar de org al elegir el rol).
  useEffect(() => {
    if (!open) return;
    if (!form.organizationId) {
      setSites([]);
      return;
    }
    void fetchList<SiteDto>(`/api/sites?organizationId=${form.organizationId}`).then(setSites);
  }, [open, form.organizationId]);

  // org_admin solo crea usuarios en su propia organización.
  useEffect(() => {
    if (open && !isSystemAdmin && currentUser?.organizationId) {
      setForm((f) => ({ ...f, organizationId: currentUser.organizationId! }));
    }
  }, [open, isSystemAdmin, currentUser?.organizationId]);

  function handleClose() {
    setForm(initialForm);
    setPositionSelection("");
    setCustomPosition("");
    setError(null);
    onClose();
  }

  // Igual que con sitios: solo mostrar encuestas de la organización elegida.
  const orgScopedSurveyDefinitions = surveyDefinitions.filter(
    (d) => !form.organizationId || d.organizationId === form.organizationId
  );

  const positionOptions: DropdownOption[] = [
    { value: "", label: t("createUserModal.institutionalPositionPlaceholder") },
    ...institutionalPositions.map((p) => ({ value: p.name, label: p.name })),
    { value: OTHER_POSITION_VALUE, label: t("createUserModal.institutionalPositionOther") },
  ];

  function toggleAllSites(field: "siteIds" | "excludedSiteIds") {
    setForm((f) => {
      const allSelected = sites.length > 0 && sites.every((s) => f[field].includes(s.id));
      return { ...f, [field]: allSelected ? [] : sites.map((s) => s.id) };
    });
  }

  function toggleFeature(key: string) {
    setForm((f) => ({
      ...f,
      featureKeys: f.featureKeys.includes(key)
        ? f.featureKeys.filter((k) => k !== key)
        : [...f.featureKeys, key],
    }));
  }

  function toggleReportTemplate(key: string) {
    setForm((f) => ({
      ...f,
      reportTemplateKeys: f.reportTemplateKeys.includes(key)
        ? f.reportTemplateKeys.filter((k) => k !== key)
        : [...f.reportTemplateKeys, key],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const institutionalPosition =
        positionSelection === OTHER_POSITION_VALUE ? customPosition.trim() : positionSelection;
      if (positionSelection === OTHER_POSITION_VALUE && institutionalPosition) {
        // Se agrega al catálogo (upsert idempotente) para que la próxima vez
        // aparezca directo en el dropdown, sin volver a escribirlo a mano.
        const token = useAuthStore.getState().token;
        await fetch("/api/institutional-positions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ name: institutionalPosition }),
        });
      }

      await onSubmit({
        ...form,
        institutionalPosition: institutionalPosition || null,
        featureKeys: form.role === "functionality_user" ? form.featureKeys : [],
        reportTemplateKeys: form.role === "report_viewer" ? form.reportTemplateKeys : [],
        organizationId: form.role === "system_admin" ? null : form.organizationId || null,
      });
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("createUserModal.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t("createUserModal.title")}
      footer={
        <>
          <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="create-user-form" loading={isSubmitting}>
            {t("createUserModal.submit")}
          </Button>
        </>
      }
    >
      <form id="create-user-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t("createUserModal.fullName")}
            id="name"
            required
            placeholder="Jane Doe"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <TextField
            label={t("users.table.username")}
            id="username"
            required
            placeholder="jane_doe"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))}
          />
        </div>

        <TextField
          label={t("users.table.email")}
          id="email"
          type="email"
          required
          placeholder="jane@example.com"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
        />

        <TextField
          label={t("login.password")}
          id="password"
          type="password"
          required
          placeholder={t("common.minChars8")}
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
        />

        <Dropdown
          label={t("createUserModal.institutionalPosition")}
          id="institutionalPosition"
          options={positionOptions}
          value={positionSelection}
          onChange={setPositionSelection}
        />
        {positionSelection === OTHER_POSITION_VALUE && (
          <TextField
            id="institutionalPositionCustom"
            placeholder={t("createUserModal.institutionalPositionNewPlaceholder")}
            value={customPosition}
            onChange={(e) => setCustomPosition(e.target.value)}
          />
        )}

        <Dropdown
          label={t("users.table.role")}
          id="role"
          options={roleOptions}
          value={form.role}
          onChange={(val) =>
            setForm((f) => ({ ...f, role: val as Role, featureKeys: [], reportTemplateKeys: [] }))
          }
        />

        {/* Organización: el usuario ve toda su información (todos los sitios
            y encuestas), salvo lo marcado explícitamente como excluido abajo. */}
        {form.role !== "system_admin" && (
          <>
            <Dropdown
              label={t("createUserModal.organization")}
              id="organization"
              options={
                isSystemAdmin
                  ? [{ value: "", label: t("createUserModal.noOrganization") }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]
                  : orgs
                      .filter((o) => o.id === currentUser?.organizationId)
                      .map((o) => ({ value: o.id, label: o.name }))
              }
              value={form.organizationId}
              onChange={(val) => setForm((f) => ({ ...f, organizationId: val }))}
              disabled={!isSystemAdmin}
            />
            {sites.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">
                    {t("createUserModal.defaultSites")}{" "}
                    <span className="font-normal text-gray-400">{t("createUserModal.defaultSitesHint")}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleAllSites("siteIds")}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {sites.every((s) => form.siteIds.includes(s.id))
                      ? t("createUserModal.deselectAll")
                      : t("createUserModal.selectAll")}
                  </button>
                </div>
                <div className="space-y-1 rounded-lg border border-gray-200 p-3">
                  {sites.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 accent-primary"
                        checked={form.siteIds.includes(s.id)}
                        onChange={() =>
                          setForm((f) => ({
                            ...f,
                            siteIds: f.siteIds.includes(s.id)
                              ? f.siteIds.filter((id) => id !== s.id)
                              : [...f.siteIds, s.id],
                          }))
                        }
                      />
                      <span className="text-sm text-gray-800">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {sites.length > 0 && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-700">
                    {t("createUserModal.excludedSites")}{" "}
                    <span className="font-normal text-gray-400">{t("createUserModal.excludedSitesHint")}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleAllSites("excludedSiteIds")}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {sites.every((s) => form.excludedSiteIds.includes(s.id))
                      ? t("createUserModal.deselectAll")
                      : t("createUserModal.selectAll")}
                  </button>
                </div>
                <div className="space-y-1 rounded-lg border border-gray-200 p-3">
                  {sites.map((s) => (
                    <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 accent-danger"
                        checked={form.excludedSiteIds.includes(s.id)}
                        onChange={() =>
                          setForm((f) => ({
                            ...f,
                            excludedSiteIds: f.excludedSiteIds.includes(s.id)
                              ? f.excludedSiteIds.filter((id) => id !== s.id)
                              : [...f.excludedSiteIds, s.id],
                          }))
                        }
                      />
                      <span className="text-sm text-gray-800">{s.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {orgScopedSurveyDefinitions.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-700">
                  {t("createUserModal.excludedSurveys")}{" "}
                  <span className="font-normal text-gray-400">{t("createUserModal.excludedSurveysHint")}</span>
                </p>
                <div className="space-y-1 rounded-lg border border-gray-200 p-3">
                  {orgScopedSurveyDefinitions.map((d) => (
                    <label key={d.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 accent-danger"
                        checked={form.excludedSurveyDefinitionIds.includes(d.id)}
                        onChange={() =>
                          setForm((f) => ({
                            ...f,
                            excludedSurveyDefinitionIds: f.excludedSurveyDefinitionIds.includes(d.id)
                              ? f.excludedSurveyDefinitionIds.filter((id) => id !== d.id)
                              : [...f.excludedSurveyDefinitionIds, d.id],
                          }))
                        }
                      />
                      <span className="text-sm text-gray-800">{d.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {form.role === "functionality_user" && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">{t("createUserModal.allowedFeatures")}</p>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              {Object.values(FEATURES_REGISTRY).map((feature) => (
                <label
                  key={feature.key}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                    checked={form.featureKeys.includes(feature.key)}
                    onChange={() => toggleFeature(feature.key)}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{feature.name}</p>
                    <p className="text-xs text-gray-500">{feature.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {form.role === "report_viewer" && (
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">{t("createUserModal.reportTemplates")}</p>
            <div className="space-y-2 rounded-lg border border-gray-200 p-3">
              {reportTemplates.map((template) => (
                <label
                  key={template.key}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary"
                    checked={form.reportTemplateKeys.includes(template.key)}
                    onChange={() => toggleReportTemplate(template.key)}
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{template.name}</p>
                    {template.description && <p className="text-xs text-gray-500">{template.description}</p>}
                  </div>
                </label>
              ))}
              {reportTemplates.length === 0 && (
                <p className="text-sm text-gray-400">{t("createUserModal.noReportTemplates")}</p>
              )}
            </div>
          </div>
        )}

        {form.role === "system_admin" && (
          <p className="rounded-md bg-primary-muted px-3 py-2 text-sm text-primary">
            {t("createUserModal.systemAdminNote")}
          </p>
        )}

        {form.role === "org_admin" && (
          <p className="rounded-md bg-primary-muted px-3 py-2 text-sm text-primary">
            {t("createUserModal.orgAdminNote")}
          </p>
        )}

        {error && (
          <p className="rounded-md bg-danger-muted px-3 py-2 text-sm text-danger">{error}</p>
        )}
      </form>
    </Modal>
  );
}

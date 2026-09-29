import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type {
  AssignedReportDto,
  AssignedReportVersionDto,
  ReportAssignmentStatus,
  User,
} from "@epi/shared";
import { REPORT_ASSIGNMENT_STATUSES } from "@epi/shared";
import {
  Badge,
  Button,
  ConfirmModal,
  Dropdown,
  Label,
  Modal,
  Table,
  TextField,
} from "../../shared/components";
import type { Column, DropdownOption } from "../../shared/components";
import { apiClient } from "../../lib/api-client";
import {
  REPORT_TEMPLATES,
  getFillableImageFields,
  getFillableTextFields,
  getRequiredFillableFields,
} from "./templates";
import { useI18n } from "../../lib/i18n";

const STATUS_COLOR: Record<ReportAssignmentStatus, "gray" | "blue" | "green"> =
  {
    pending: "gray",
    in_review: "blue",
    published: "green",
  };

const initialForm = { userId: "", templateKeys: [] as string[] };

export function ReportAssignmentsPage() {
  const { t, lang } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const locale = lang === "es" ? "es-MX" : "en-US";
  const STATUS_LABELS: Record<ReportAssignmentStatus, string> = {
    pending: t("interactiveReports.status.pending"),
    in_review: t("interactiveReports.status.inReview"),
    published: t("interactiveReports.status.published"),
  };

  const [reports, setReports] = useState<AssignedReportDto[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssignedReportDto | null>(null);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [textContent, setTextContent] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<ReportAssignmentStatus>("pending");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<AssignedReportDto | null>(null);
  const [history, setHistory] = useState<AssignedReportDto | null>(null);
  const [versions, setVersions] = useState<AssignedReportVersionDto[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, s] = await Promise.all([
        apiClient.get<AssignedReportDto[]>("/api/reports/assignments"),
        apiClient.get<User[]>("/api/users"),
        apiClient.get<{ id: string; name: string }[]>("/api/sites"),
      ]);
      setReports(r);
      setUsers(u);
      setSites(s);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("fromReport") !== "1") return;
    setEditing(null);
    setForm(initialForm);
    setFilters(
      Object.fromEntries(
        ["siteIds", "type", "school", "category", "from", "to"]
          .map((key) => [key, searchParams.get(key) ?? ""])
          .filter(([, value]) => value),
      ),
    );
    setTextContent({});
    setStatus("pending");
    setError(null);
    setModalOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const userLabelById = new Map(
    users.map((u) => [u.id, `${u.name} (${u.username})`]),
  );
  const userOptions: DropdownOption[] = users.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.username})`,
  }));
  const templateOptions: DropdownOption[] = Object.values(REPORT_TEMPLATES).map(
    (tpl) => ({
      value: tpl.key,
      label: tpl.title,
    }),
  );
  const statusOptions: DropdownOption[] = REPORT_ASSIGNMENT_STATUSES.map(
    (s) => ({ value: s, label: STATUS_LABELS[s] }),
  );

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setFilters({});
    setTextContent({});
    setStatus("pending");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(report: AssignedReportDto) {
    setEditing(report);
    setForm({ userId: report.userId, templateKeys: [report.templateKey] });
    setFilters(
      Object.fromEntries(
        Object.entries(report.filters ?? {}).map(([k, v]) => [
          k,
          String(v ?? ""),
        ]),
      ),
    );
    setTextContent(report.textContent ?? {});
    setStatus(report.status);
    setError(null);
    setModalOpen(true);
  }

  function toggleTemplate(templateKey: string) {
    const template = REPORT_TEMPLATES[templateKey];
    setForm((f) => ({
      ...f,
      templateKeys: editing
        ? [templateKey]
        : f.templateKeys.includes(templateKey)
          ? f.templateKeys.filter((key) => key !== templateKey)
          : [...f.templateKeys, templateKey],
    }));
    if (!editing && template?.defaults && !Object.keys(filters).length)
      setFilters(template.defaults.filters ?? {});
    if (!editing && template?.defaults && !Object.keys(textContent).length)
      setTextContent(template.defaults.textContent ?? {});
  }

  function attachImage(fieldKey: string, file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(t("reportAssignments.imageTypeError"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(t("reportAssignments.imageSizeError"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setTextContent((current) => ({ ...current, [fieldKey]: reader.result as string }));
        setError(null);
      }
    };
    reader.onerror = () => setError(t("reportAssignments.imageReadError"));
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    if (!form.templateKeys.length) return;
    const templateKey = form.templateKeys[0]!;
    const selectedTemplate = REPORT_TEMPLATES[templateKey];
    const selectedTemplates = form.templateKeys
      .map((key) => REPORT_TEMPLATES[key])
      .filter((template): template is NonNullable<typeof template> =>
        Boolean(template),
      );
    const requiredMissing = selectedTemplates.flatMap((template) => [
      ...template.filters
        .filter((f) => f.required && !filters[f.key]?.trim())
        .map((f) => f.label),
      ...getRequiredFillableFields(template)
        .filter((f) => !textContent[f.key]?.trim())
        .map((f) => f.label),
    ]);
    if (status === "published" && requiredMissing.length) {
      setError(`Faltan datos para publicar: ${requiredMissing.join(", ")}`);
      return;
    }
    setSaving(true);
    setError(null);
    const cleanedFilters = Object.fromEntries(
      Object.entries(filters)
        .filter(([, v]) => v.trim())
        .map(([k, v]) => [k, v.trim()]),
    );
    const selectedSiteIds = selectedSites;
    if (selectedSiteIds.length)
      cleanedFilters.siteIds = selectedSiteIds.join(",");
    else delete cleanedFilters.siteIds;
    try {
      if (editing) {
        await apiClient.patch(`/api/reports/assignments/${editing.id}`, {
          templateKey,
          status,
          filters: Object.keys(cleanedFilters).length ? cleanedFilters : null,
          textContent,
        });
      } else {
        if (!form.userId) return;
        await Promise.all(
          form.templateKeys.map((templateKey) =>
            apiClient.post("/api/reports/assignments", {
              userId: form.userId,
              templateKey,
              filters: Object.keys(cleanedFilters).length
                ? cleanedFilters
                : null,
              textContent,
            }),
          ),
        );
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  const selectedTemplate = form.templateKeys[0]
    ? REPORT_TEMPLATES[form.templateKeys[0]]
    : undefined;
  const selectedTemplates = form.templateKeys
    .map((key) => REPORT_TEMPLATES[key])
    .filter((template): template is NonNullable<typeof template> =>
      Boolean(template),
    );
  const imageFieldKeys = new Set(selectedTemplates.flatMap(getFillableImageFields).map((field) => field.key));
  const fillableFields = [...new Map(
    selectedTemplates
      .flatMap(getFillableTextFields)
      .map((field) => [field.key, { ...field, kind: imageFieldKeys.has(field.key) ? "image" as const : "text" as const }]),
  ).values()];
  const filterFields = [
    ...new Map(
      selectedTemplates
        .flatMap((template) =>
          template.filters.filter((field) => field.key !== "siteId"),
        )
        .map((field) => [field.key, field]),
    ).values(),
  ];
  const selectedSites = (filters.siteIds ?? "").split(",").filter(Boolean);

  async function openHistory(report: AssignedReportDto) {
    setHistory(report);
    setVersions(
      await apiClient.get<AssignedReportVersionDto[]>(
        `/api/reports/assignments/${report.id}/versions`,
      ),
    );
  }

  const columns: Column<AssignedReportDto>[] = [
    {
      key: "userId",
      header: t("reportAssignments.table.assignee"),
      render: (r) => userLabelById.get(r.userId) ?? "—",
    },
    {
      key: "templateKey",
      header: t("reportAssignments.table.template"),
      render: (r) => REPORT_TEMPLATES[r.templateKey]?.title ?? r.templateKey,
    },
    {
      key: "status",
      header: t("common.status"),
      render: (r) => (
        <Badge color={STATUS_COLOR[r.status]}>{STATUS_LABELS[r.status]}</Badge>
      ),
    },
    {
      key: "version",
      header: t("reportAssignments.table.version"),
      render: (r) => `v${r.version}`,
    },
    {
      key: "updatedAt",
      header: t("reportAssignments.table.updated"),
      render: (r) => new Date(r.updatedAt).toLocaleDateString(locale),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => void openHistory(r)}>
            {t("reportAssignments.history")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
            {t("common.edit")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setDeleting(r)}>
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
          <Label variant="title" className="block">
            {t("reportAssignments.title")}
          </Label>
          <p className="mt-0.5 text-sm text-gray-500">
            {t("reportAssignments.subtitle")}
          </p>
        </div>
        <Button onClick={openCreate}>{t("reportAssignments.add")}</Button>
      </div>

      <Table
        columns={columns}
        rows={reports}
        keyExtractor={(r) => r.id}
        loading={loading}
        emptyText={t("reportAssignments.empty")}
        pageSize={25}
      />

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={
          editing
            ? t("reportAssignments.editTitle")
            : t("reportAssignments.addTitle")
        }
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
          {!editing && (
            <Dropdown
              label={t("reportAssignments.table.assignee")}
              options={userOptions}
              value={form.userId}
              onChange={(v) => setForm((f) => ({ ...f, userId: v }))}
            />
          )}
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">
              {t("reportAssignments.table.template")}
            </p>
            <div className="space-y-2 rounded-md border border-gray-200 p-3">
              {templateOptions.map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={form.templateKeys.includes(option.value)}
                    onChange={() => toggleTemplate(option.value)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1 text-sm font-medium text-gray-700">
              {t("reportAssignments.sites")}
            </p>
            <p className="mb-2 text-xs text-gray-500">
              {t("reportAssignments.allSites")}
            </p>
            <div className="max-h-40 space-y-2 overflow-y-auto rounded-md border border-gray-200 p-3">
              {sites.map((site) => (
                <label
                  key={site.id}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <input
                    type="checkbox"
                    checked={selectedSites.includes(site.id)}
                    onChange={() =>
                      setFilters((current) => ({
                        ...current,
                        siteIds: selectedSites.includes(site.id)
                          ? selectedSites
                              .filter((id) => id !== site.id)
                              .join(",")
                          : [...selectedSites, site.id].join(","),
                      }))
                    }
                  />
                  {site.name}
                </label>
              ))}
            </div>
          </div>
          {filterFields.map((field) => (
            <TextField
              key={field.key}
              label={`${field.label}${field.required ? " *" : ""}`}
              type={field.kind === "date" ? "date" : "text"}
              value={filters[field.key] ?? ""}
              onChange={(e) =>
                setFilters((current) => ({
                  ...current,
                  [field.key]: e.target.value,
                }))
              }
            />
          ))}
          {fillableFields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                {field.label}{field.kind === "image" ? " · imagen" : ""}
              </label>
              {field.kind === "image" ? (
                <>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => attachImage(field.key, e.target.files?.[0])}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:text-white"
                  />
                  {textContent[field.key] && (
                    <img src={textContent[field.key]} alt={field.label} className="h-32 w-full rounded-md object-cover" />
                  )}
                  <p className="text-xs text-gray-500">{t("reportAssignments.imageHelp")}</p>
                </>
              ) : (
                <textarea
                  rows={3}
                  value={textContent[field.key] ?? ""}
                  onChange={(e) =>
                    setTextContent((c) => ({ ...c, [field.key]: e.target.value }))
                  }
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              )}
            </div>
          ))}
          {editing && (
            <Dropdown
              label={t("common.status")}
              options={statusOptions}
              value={status}
              onChange={(v) => setStatus(v as ReportAssignmentStatus)}
            />
          )}
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={!!history}
        onClose={() => setHistory(null)}
        title={t("reportAssignments.historyTitle")}
        footer={
          <Button variant="ghost" onClick={() => setHistory(null)}>
            {t("common.cancel")}
          </Button>
        }
      >
        <ul className="divide-y divide-gray-100">
          {versions.map((v) => (
            <li key={v.id} className="py-2 text-sm">
              <span className="font-medium text-gray-800">v{v.version}</span>{" "}
              <Badge color={STATUS_COLOR[v.status]}>
                {STATUS_LABELS[v.status]}
              </Badge>{" "}
              <span className="text-gray-600">{v.title}</span>
              <p className="mt-0.5 text-xs text-gray-400">
                {v.actorUsername} ·{" "}
                {new Date(v.createdAt).toLocaleString(locale)}
              </p>
            </li>
          ))}
          {versions.length === 0 && (
            <li className="py-2 text-sm text-gray-400">
              {t("reportAssignments.empty")}
            </li>
          )}
        </ul>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title={t("reportAssignments.deleteTitle")}
        message={t("reportAssignments.deleteMessage").replace(
          "{title}",
          deleting?.title ?? "",
        )}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await apiClient.delete(`/api/reports/assignments/${deleting!.id}`);
          await load();
        }}
      />
    </div>
  );
}

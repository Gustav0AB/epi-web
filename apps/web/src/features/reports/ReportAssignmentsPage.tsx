import { useCallback, useEffect, useState } from "react";
import type { AssignedReportDto, AssignedReportVersionDto, ReportAssignmentStatus, User } from "@epi/shared";
import { REPORT_ASSIGNMENT_STATUSES } from "@epi/shared";
import { Badge, Button, ConfirmModal, Dropdown, Label, Modal, Table, TextField } from "../../shared/components";
import type { Column, DropdownOption } from "../../shared/components";
import { apiClient } from "../../lib/api-client";
import { REPORT_TEMPLATES, getFillableTextFields } from "./templates";
import { useI18n } from "../../lib/i18n";

const STATUS_COLOR: Record<ReportAssignmentStatus, "gray" | "blue" | "green"> = {
  pending: "gray",
  in_review: "blue",
  published: "green",
};

const initialForm = { userId: "", templateKey: "", title: "" };

export function ReportAssignmentsPage() {
  const { t, lang } = useI18n();
  const locale = lang === "es" ? "es-MX" : "en-US";
  const STATUS_LABELS: Record<ReportAssignmentStatus, string> = {
    pending: t("interactiveReports.status.pending"),
    in_review: t("interactiveReports.status.inReview"),
    published: t("interactiveReports.status.published"),
  };

  const [reports, setReports] = useState<AssignedReportDto[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AssignedReportDto | null>(null);
  const [form, setForm] = useState(initialForm);
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
      const [r, u] = await Promise.all([
        apiClient.get<AssignedReportDto[]>("/api/reports/assignments"),
        apiClient.get<User[]>("/api/users"),
      ]);
      setReports(r);
      setUsers(u);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const userLabelById = new Map(users.map((u) => [u.id, `${u.name} (${u.username})`]));
  const userOptions: DropdownOption[] = users.map((u) => ({ value: u.id, label: `${u.name} (${u.username})` }));
  const templateOptions: DropdownOption[] = Object.values(REPORT_TEMPLATES).map((tpl) => ({
    value: tpl.key,
    label: tpl.title,
  }));
  const statusOptions: DropdownOption[] = REPORT_ASSIGNMENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }));

  function openCreate() {
    setEditing(null);
    setForm(initialForm);
    setTextContent({});
    setStatus("pending");
    setError(null);
    setModalOpen(true);
  }

  function openEdit(report: AssignedReportDto) {
    setEditing(report);
    setForm({ userId: report.userId, templateKey: report.templateKey, title: report.title });
    setTextContent(report.textContent ?? {});
    setStatus(report.status);
    setError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim() || !form.templateKey) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await apiClient.patch(`/api/reports/assignments/${editing.id}`, {
          templateKey: form.templateKey,
          title: form.title.trim(),
          status,
          textContent,
        });
      } else {
        if (!form.userId) return;
        await apiClient.post("/api/reports/assignments", {
          userId: form.userId,
          templateKey: form.templateKey,
          title: form.title.trim(),
          textContent,
        });
      }
      setModalOpen(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  const fillableFields = form.templateKey && REPORT_TEMPLATES[form.templateKey] ? getFillableTextFields(REPORT_TEMPLATES[form.templateKey]!) : [];

  async function openHistory(report: AssignedReportDto) {
    setHistory(report);
    setVersions(await apiClient.get<AssignedReportVersionDto[]>(`/api/reports/assignments/${report.id}/versions`));
  }

  const columns: Column<AssignedReportDto>[] = [
    { key: "title", header: t("reportAssignments.table.title") },
    { key: "userId", header: t("reportAssignments.table.assignee"), render: (r) => userLabelById.get(r.userId) ?? "—" },
    {
      key: "templateKey",
      header: t("reportAssignments.table.template"),
      render: (r) => REPORT_TEMPLATES[r.templateKey]?.title ?? r.templateKey,
    },
    { key: "status", header: t("common.status"), render: (r) => <Badge color={STATUS_COLOR[r.status]}>{STATUS_LABELS[r.status]}</Badge> },
    { key: "version", header: t("reportAssignments.table.version"), render: (r) => `v${r.version}` },
    { key: "updatedAt", header: t("reportAssignments.table.updated"), render: (r) => new Date(r.updatedAt).toLocaleDateString(locale) },
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
          <Label variant="title" className="block">{t("reportAssignments.title")}</Label>
          <p className="mt-0.5 text-sm text-gray-500">{t("reportAssignments.subtitle")}</p>
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
        title={editing ? t("reportAssignments.editTitle") : t("reportAssignments.addTitle")}
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
          <Dropdown
            label={t("reportAssignments.table.template")}
            options={templateOptions}
            value={form.templateKey}
            onChange={(v) => setForm((f) => ({ ...f, templateKey: v }))}
          />
          <TextField
            label={t("reportAssignments.table.title")}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Reporte Marzo 2026"
          />
          {fillableFields.map((field) => (
            <div key={field.key} className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">{field.label}</label>
              <textarea
                rows={3}
                value={textContent[field.key] ?? ""}
                onChange={(e) => setTextContent((c) => ({ ...c, [field.key]: e.target.value }))}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
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
              <Badge color={STATUS_COLOR[v.status]}>{STATUS_LABELS[v.status]}</Badge>{" "}
              <span className="text-gray-600">{v.title}</span>
              <p className="mt-0.5 text-xs text-gray-400">
                {v.actorUsername} · {new Date(v.createdAt).toLocaleString(locale)}
              </p>
            </li>
          ))}
          {versions.length === 0 && <li className="py-2 text-sm text-gray-400">{t("reportAssignments.empty")}</li>}
        </ul>
      </Modal>

      <ConfirmModal
        open={!!deleting}
        title={t("reportAssignments.deleteTitle")}
        message={t("reportAssignments.deleteMessage").replace("{title}", deleting?.title ?? "")}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await apiClient.delete(`/api/reports/assignments/${deleting!.id}`);
          await load();
        }}
      />
    </div>
  );
}

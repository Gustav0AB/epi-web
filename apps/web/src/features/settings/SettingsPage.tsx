import { useCallback, useEffect, useState } from "react";
import type { ApiResponse, ReportTemplate } from "@epi/shared";
import { Button, Card, Label, TextField } from "../../shared/components";
import { useAuthStore } from "../../store/auth.store";
import { useI18n } from "../../lib/i18n";

async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const token = useAuthStore.getState().token;
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.success) throw new Error(json.error.message);
  return json.data;
}

// Configuración (solo admin): plantillas de reporte. Organizaciones, sitios
// y categorías tienen sus propias pantallas (ver features/organizations,
// features/sites, features/categories).
export function SettingsPage() {
  const { t } = useI18n();
  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [templateKey, setTemplateKey] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setReportTemplates(await call<ReportTemplate[]>("/api/report-templates"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("settings.loadError"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addReportTemplate() {
    if (!templateKey.trim() || !templateName.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await call("/api/report-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: templateKey.trim(), name: templateName.trim() }),
      });
      setTemplateKey("");
      setTemplateName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">
          {t("header.settings")}
        </Label>
        <p className="mt-0.5 text-sm text-gray-500">
          {t("settings.subtitle")}
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <Label variant="subtitle" className="mb-4 block">
          {t("createUserModal.reportTemplates")}
        </Label>
        <p className="mb-2 text-sm text-gray-500">
          {t("settings.reportTemplates.subtitle")}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <TextField
            label={t("settings.reportTemplates.key")}
            value={templateKey}
            onChange={(e) => setTemplateKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
            placeholder="reporte_escolar"
          />
          <TextField
            label={t("users.table.name")}
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Reporte escolar"
          />
          <Button loading={saving} onClick={addReportTemplate}>
            {t("common.add")}
          </Button>
        </div>
        <ul className="mt-4 divide-y divide-gray-100">
          {reportTemplates.map((rt) => (
            <li key={rt.id} className="py-2 text-sm text-gray-800">
              {rt.name} <span className="font-mono text-xs text-gray-400">({rt.key})</span>
            </li>
          ))}
          {reportTemplates.length === 0 && (
            <li className="py-2 text-sm text-gray-400">{t("settings.reportTemplates.empty")}</li>
          )}
        </ul>
      </Card>
    </div>
  );
}

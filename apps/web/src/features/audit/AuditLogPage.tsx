import { useCallback, useEffect, useState } from "react";
import type { AuditLogDto } from "@epi/shared";
import { Badge, Label, Table } from "@epi/ui";
import type { Column } from "@epi/ui";
import { apiClient } from "../../lib/api-client";
import { useI18n, type I18nKey } from "../../lib/i18n";

const ACTION_LABELS: Record<string, I18nKey> = {
  USER_UPDATE: "auditLog.action.userUpdate",
  ORGANIZATION_CREATE: "auditLog.action.organizationCreate",
  ORGANIZATION_UPDATE: "auditLog.action.organizationUpdate",
  ORGANIZATION_DELETE: "auditLog.action.organizationDelete",
  SURVEY_SETUP_SAVE: "auditLog.action.instrumentDraft",
  SURVEY_CONFIGURATION_ACTIVATE: "auditLog.action.instrumentActivate",
  CATEGORY_SITES_CHANGE: "auditLog.action.categorySitesChange",
  SURVEY_VERSION_REPROCESS: "auditLog.action.versionReprocess",
  SURVEY_VERSION_REPROCESS_PROGRESS: "auditLog.action.versionProgress",
  SURVEY_VERSION_REPROCESS_ERROR: "auditLog.action.versionError",
  COURSE_MAIN_SCHOOL_CHANGE: "auditLog.action.courseMainSchoolChange",
  LOGIN: "auditLog.action.login",
  USER_CREATE: "auditLog.action.userCreate",
  USER_DELETE: "auditLog.action.userDelete",
  USER_ROLE_CHANGE: "auditLog.action.userRoleChange",
  PASSWORD_RESET: "auditLog.action.passwordReset",
  CATEGORY_IMPORT: "auditLog.action.categoryImport",
  SITE_CATALOG_DUPLICATE: "auditLog.action.siteCatalogDuplicate",
  SITE_CREATE: "auditLog.action.siteCreate",
  SITE_UPDATE: "auditLog.action.siteUpdate",
  SITE_DELETE: "auditLog.action.siteDelete",
  CATEGORY_CREATE: "auditLog.action.categoryCreate",
  CATEGORY_UPDATE: "auditLog.action.categoryUpdate",
  CATEGORY_DELETE: "auditLog.action.categoryDelete",
  CATEGORY_REACTIVATE: "auditLog.action.categoryReactivate",
};

const detailLabels: Record<string, string> = { isOpenPublic: "Abierto al público", school: "Escuela principal", name: "Nombre", organizationId: "Organización", programs: "Programas", activityTypes: "Tipos de actividad", isActive: "Activo", subcategory: "Subcategoría" };
function description(action: string, metadata: unknown) {
  const data = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const current = data.current && typeof data.current === "object" ? data.current as Record<string, unknown> : {};
  const previous = data.previous && typeof data.previous === "object" ? data.previous as Record<string, unknown> : {};
  const name = current.name ?? previous.name ?? data.name ?? data.username;
  const descriptions: Record<string, string> = {
    SITE_CREATE: "Se agregó el sitio", SITE_UPDATE: "Se modificó el sitio", SITE_DELETE: "Se desactivó el sitio",
    CATEGORY_CREATE: "Se agregó la categoría", CATEGORY_UPDATE: "Se modificó la categoría", CATEGORY_DELETE: "Se desactivó la categoría", CATEGORY_REACTIVATE: "Se reactivó la categoría",
    ORGANIZATION_CREATE: "Se agregó la organización", ORGANIZATION_UPDATE: "Se modificó la organización", ORGANIZATION_DELETE: "Se desactivó la organización",
    USER_CREATE: "Se agregó el usuario", USER_UPDATE: "Se modificó el usuario", USER_DELETE: "Se eliminó el usuario", USER_ROLE_CHANGE: "Se modificó el rol del usuario",
    SURVEY_CONFIGURATION_ACTIVATE: "Se activó el instrumento", SURVEY_SETUP_SAVE: "Se guardó el borrador del instrumento",
  };
  const text = descriptions[action];
  return text ? `${text}${typeof name === "string" && name ? ` ${name}` : " (nombre no registrado)"}.` : null;
}
function catalogDetails(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || !("current" in metadata)) return null;
  const record = metadata as { previous?: Record<string, unknown> | null; current?: Record<string, unknown> | null };
  const fields = new Set([...Object.keys(record.previous ?? {}), ...Object.keys(record.current ?? {})]);
  const display = (value: unknown) => value == null ? "—" : Array.isArray(value) ? value.join(", ") || "—" : typeof value === "boolean" ? value ? "Sí" : "No" : String(value);
  return [ ...("sourceSiteName" in metadata ? [<p key="source">Sitio de origen: {String((metadata as { sourceSiteName: unknown }).sourceSiteName)}</p>] : []), ...[...fields].filter(field => JSON.stringify(record.previous?.[field]) !== JSON.stringify(record.current?.[field])).map(field => <p key={field}><strong>{detailLabels[field] ?? field}:</strong> {display(record.previous?.[field])} → {display(record.current?.[field])}</p>) ];
}

export function AuditLogPage() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await apiClient.get<AuditLogDto[]>("/api/audit-logs?pageSize=200"));
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<AuditLogDto>[] = [
    {
      key: "createdAt",
      header: t("auditLog.table.when"),
      render: (l) => new Date(l.createdAt).toLocaleString(),
    },
    {
      key: "actorUsername",
      header: t("auditLog.table.actor"),
      render: (l) => (
        <span>
          {l.actorUsername} <span className="text-xs text-gray-400">({l.actorRole})</span>
        </span>
      ),
    },
    {
      key: "action",
      header: t("auditLog.table.action"),
      render: (l) => {
        const key = ACTION_LABELS[l.action];
        return <Badge color="blue">{key ? t(key) : l.action}</Badge>;
      },
    },
    {
      key: "metadata",
      header: t("auditLog.table.details"),
      render: (l) => <div className="text-xs text-gray-600">{description(l.action, l.metadata) && <p>{description(l.action, l.metadata)}</p>}{l.metadata && (catalogDetails(l.metadata) ?? (!description(l.action, l.metadata) ? JSON.stringify(l.metadata) : null))}{!l.metadata && !description(l.action, l.metadata) && "—"}</div>,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">{t("auditLog.title")}</Label>
        <p className="mt-0.5 text-sm text-gray-500">{t("auditLog.subtitle")}</p>
      </div>

      <Table
        columns={columns}
        rows={logs}
        keyExtractor={(l) => l.id}
        loading={loading}
        emptyText={t("auditLog.empty")}
        pageSize={25}
      />
    </div>
  );
}

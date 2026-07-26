import { useCallback, useEffect, useState } from "react";
import type { AuditLogDto } from "@epi/shared";
import { Badge, Label, Table } from "../../shared/components";
import type { Column } from "../../shared/components";
import { apiClient } from "../../lib/api-client";
import { useI18n, type I18nKey } from "../../lib/i18n";

const ACTION_LABELS: Record<string, I18nKey> = {
  LOGIN: "auditLog.action.login",
  USER_CREATE: "auditLog.action.userCreate",
  USER_DELETE: "auditLog.action.userDelete",
  USER_ROLE_CHANGE: "auditLog.action.userRoleChange",
  PASSWORD_RESET: "auditLog.action.passwordReset",
  CATEGORY_IMPORT: "auditLog.action.categoryImport",
};

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
      key: "targetId",
      header: t("auditLog.table.target"),
      render: (l) => (l.targetType && l.targetId ? `${l.targetType} · ${l.targetId}` : "—"),
    },
    {
      key: "metadata",
      header: t("auditLog.table.details"),
      render: (l) => (l.metadata ? <span className="font-mono text-xs text-gray-500">{JSON.stringify(l.metadata)}</span> : "—"),
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

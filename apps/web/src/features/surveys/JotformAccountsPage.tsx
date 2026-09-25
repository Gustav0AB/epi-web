import { useCallback, useEffect, useState } from "react";
import type { JotformAccountDto } from "@epi/shared";
import { Badge, Button, Card, Label, Table, TextField } from "../../shared/components";
import type { Column } from "../../shared/components";
import { apiClient } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

export function JotformAccountsPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<JotformAccountDto[]>([]);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await apiClient.get<JotformAccountDto[]>("/api/surveys/jotform/accounts"));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!name.trim() || !apiKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiClient.post("/api/surveys/jotform/accounts", { name: name.trim(), apiKey: apiKey.trim() });
      setName("");
      setApiKey("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(account: JotformAccountDto) {
    await apiClient.delete(`/api/surveys/jotform/accounts/${account.id}`);
    await load();
  }

  const columns: Column<JotformAccountDto>[] = [
    { key: "name", header: t("users.table.name") },
    { key: "apiKeyPreview", header: t("jotformAccounts.apiKey") },
    {
      key: "createdAt",
      header: t("common.status"),
      render: () => <Badge color="green">{t("common.active")}</Badge>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (account) => (
        <Button variant="ghost" size="sm" onClick={() => void disconnect(account)}>
          {t("jotformAccounts.disconnect")}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">
          {t("jotformAccounts.title")}
        </Label>
        <p className="mt-0.5 text-sm text-gray-500">{t("jotformAccounts.subtitle")}</p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={t("users.table.name")} value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label={t("jotformAccounts.apiKey")}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Button loading={saving} onClick={save}>
            {t("common.add")}
          </Button>
        </div>
      </Card>

      <Table
        columns={columns}
        rows={accounts}
        keyExtractor={(account) => account.id}
        loading={loading}
        emptyText={t("jotformAccounts.empty")}
      />
    </div>
  );
}

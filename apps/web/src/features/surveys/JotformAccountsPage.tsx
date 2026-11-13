import { useCallback, useEffect, useState } from "react";
import type { JotformAccountDto, JotformLabelDto } from "@epi/shared";
import { Badge, Button, Card, Label, Modal, Table, TextField } from "@epi/ui";
import type { Column } from "@epi/ui";
import { apiClient } from "../../lib/api-client";
import { useI18n } from "../../lib/i18n";

export function JotformAccountsPage() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState<JotformAccountDto[]>([]);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [labels, setLabels] = useState<JotformLabelDto[] | null>(null);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [editing, setEditing] = useState<JotformAccountDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  async function previewLabels() {
    if (!apiKey.trim()) return;
    setSaving(true); setError(null); setLabels(null); setExcluded([]);
    try { setLabels(await apiClient.post<JotformLabelDto[]>("/api/surveys/jotform/accounts/labels-preview", { apiKey: apiKey.trim() })); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.genericError")); }
    finally { setSaving(false); }
  }
  async function editLabels(account: JotformAccountDto) {
    setSaving(true); setError(null); setLabels(null); setEditing(account);
    try { const data = await apiClient.get<{ labels: JotformLabelDto[]; excludedLabelIds: string[] }>(`/api/surveys/jotform/accounts/${encodeURIComponent(account.id)}/labels`); setLabels(data.labels); setExcluded(data.excludedLabelIds); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.genericError")); setEditing(null); }
    finally { setSaving(false); }
  }
  async function saveLabels() {
    if (!editing) return;
    setSaving(true); setError(null);
    try { await apiClient.put(`/api/surveys/jotform/accounts/${encodeURIComponent(editing.id)}/labels`, { excludedLabelIds: excluded }); setEditing(null); setLabels(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : t("common.genericError")); }
    finally { setSaving(false); }
  }
  const labelChoices = labels && <div className="space-y-2"><p className="text-sm">Selecciona las etiquetas que quieres excluir. Un formulario se excluye si tiene cualquiera de ellas.</p>{labels.length ? labels.map(label => <label key={label.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={excluded.includes(label.id)} onChange={event => setExcluded(current => event.target.checked ? [...current, label.id] : current.filter(id => id !== label.id))} />{label.name}</label>) : <p>No se encontraron etiquetas.</p>}</div>;

  async function save() {
    if (!name.trim() || !apiKey.trim() || !labels) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.post("/api/surveys/jotform/accounts", { name: name.trim(), apiKey: apiKey.trim(), excludedLabelIds: excluded });
      setName("");
      setApiKey(""); setLabels(null); setExcluded([]);
      setSuccess(t("jotformAccounts.connected"));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    } finally {
      setSaving(false);
    }
  }

  async function disconnect(account: JotformAccountDto) {
    setError(null);
    setSuccess(null);
    try {
      await apiClient.delete(`/api/surveys/jotform/accounts/${account.id}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.genericError"));
    }
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
        <><Button variant="secondary" size="sm" onClick={() => void editLabels(account)}>Etiquetas excluidas</Button><Button variant="ghost" size="sm" onClick={() => void disconnect(account)}>
          {t("jotformAccounts.disconnect")}
        </Button></>
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
      {success && <p className="text-sm text-green-700">{success}</p>}

      <Card>
        <div className="flex flex-wrap items-end gap-2">
          <TextField label={t("users.table.name")} value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label={t("jotformAccounts.apiKey")}
            type="password"
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setLabels(null); setExcluded([]); }}
          />
          <Button variant="secondary" disabled={!apiKey.trim()} loading={saving} onClick={() => void previewLabels()}>Consultar etiquetas</Button>
          <Button loading={saving} disabled={!labels} onClick={save}>
            {t("common.add")}
          </Button>
        </div>
        {!editing && labelChoices}
      </Card>
      <Modal open={!!editing} title="Etiquetas excluidas" onClose={() => { if (!saving) { setEditing(null); setLabels(null); } }} footer={<Button loading={saving} disabled={!labels} onClick={() => void saveLabels()}>Guardar exclusiones</Button>} >{labelChoices}</Modal>

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

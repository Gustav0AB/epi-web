import { useEffect, useState } from "react";
import type { FormQuestionsPreviewDto, JotformFormDto, SiteDto } from "@epi/shared";
import { Badge, Button, Card, Dropdown, Label, Modal } from "../../shared/components";
import type { DropdownOption } from "../../shared/components";
import { surveyApi } from "./api";
import { useI18n } from "../../lib/i18n";

/**
 * Catálogo local de formularios de la cuenta de Jotform (GET /user/forms
 * cacheado) — permite dar de alta un formulario nuevo (sitio + tipo) sin
 * esperar a que ya haya enviado respuestas, y "Sincronizar" trae los que se
 * hayan agregado en Jotform desde la última vez.
 */
export function JotformFormsCatalog({ onRegistered }: { onRegistered: () => void }) {
  const { t } = useI18n();
  const TYPE_OPTIONS: DropdownOption[] = [
    { label: t("unregistered.typeLocal"), value: "LOCAL" },
    { label: t("unregistered.typeVisiting"), value: "VISITING" },
  ];
  const [forms, setForms] = useState<JotformFormDto[]>([]);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const [target, setTarget] = useState<JotformFormDto | null>(null);
  const [preview, setPreview] = useState<FormQuestionsPreviewDto | null>(null);
  const [siteId, setSiteId] = useState("");
  const [type, setType] = useState<"LOCAL" | "VISITING">("LOCAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    void surveyApi.jotformForms().then(setForms).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    void surveyApi.sites().then(setSites).catch(() => {});
  }, []);

  async function handleSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await surveyApi.syncJotformForms();
      setSyncMessage(`${t("jotformCatalog.syncResultPrefix")} ${result.added.length}`);
      load();
    } catch (e) {
      setSyncMessage(e instanceof Error ? e.message : t("jotformCatalog.syncError"));
    } finally {
      setSyncing(false);
    }
  }

  function openModal(form: JotformFormDto) {
    setTarget(form);
    setPreview(null);
    setSiteId("");
    setType("LOCAL");
    setError(null);
    void surveyApi.previewFormQuestions(form.id).then(setPreview).catch(() => {});
  }

  async function associate() {
    if (!target || !siteId) return;
    setSaving(true);
    setError(null);
    try {
      await surveyApi.registerDefinition({ jotformFormId: target.id, siteId, type });
      setTarget(null);
      load();
      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("unregistered.error"));
    } finally {
      setSaving(false);
    }
  }

  const siteOptions: DropdownOption[] = [
    { label: t("unregistered.selectSitePlaceholder"), value: "" },
    ...sites.map((s) => ({ label: s.name, value: s.id })),
  ];

  return (
    <Card>
      <div className="mb-1 flex items-center justify-between">
        <Label variant="subtitle">{t("jotformCatalog.title")}</Label>
        <Button size="sm" variant="secondary" loading={syncing} onClick={handleSync}>
          {t("jotformCatalog.sync")}
        </Button>
      </div>
      <p className="mb-4 text-sm text-gray-500">{t("jotformCatalog.body")}</p>
      {syncMessage && <p className="mb-3 text-sm text-primary">{syncMessage}</p>}

      {!loading && forms.length === 0 && (
        <p className="text-sm text-gray-400">{t("jotformCatalog.empty")}</p>
      )}

      {forms.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="py-2 font-medium">{t("jotformCatalog.table.title")}</th>
                <th className="py-2 font-medium">{t("jotformCatalog.table.account")}</th>
                <th className="py-2 font-medium">{t("jotformCatalog.table.id")}</th>
                <th className="py-2 font-medium">{t("jotformCatalog.table.status")}</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {forms.map((f) => (
                <tr key={f.id}>
                  <td className="py-2 text-gray-800">{f.title}</td>
                  <td className="py-2 text-gray-600">{f.accountName ?? "—"}</td>
                  <td className="py-2 font-mono text-xs text-gray-500">{f.id}</td>
                  <td className="py-2">
                    {f.registered ? (
                      <Badge color="green">{t("jotformCatalog.registered")}</Badge>
                    ) : (
                      <Badge color="blue">{t("jotformCatalog.new")}</Badge>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {!f.registered && (
                      <Button size="sm" onClick={() => openModal(f)}>
                        {t("unregistered.associate")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={`${t("unregistered.associateTitlePrefix")} ${target?.title ?? ""}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTarget(null)}>
              {t("unregistered.cancel")}
            </Button>
            <Button disabled={!siteId} loading={saving} onClick={associate}>
              {t("unregistered.associateAndProcess")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {preview && (
            <p className="text-sm text-gray-600">
              {preview.scoredQuestions.length} {t("jotformCatalog.previewQuestions")}
              {preview.catalogMatches.length > 0 && (
                <>
                  {" · "}
                  {preview.catalogMatches.length} {t("jotformCatalog.previewCatalog")} (
                  {preview.catalogMatches.map((c) => c.label).join(", ")})
                </>
              )}
            </p>
          )}
          <Dropdown label={t("unregistered.site")} options={siteOptions} value={siteId} onChange={setSiteId} />
          <Dropdown
            label={t("unregistered.surveyType")}
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => setType(v as "LOCAL" | "VISITING")}
          />
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>
    </Card>
  );
}

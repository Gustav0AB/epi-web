import { useEffect, useState } from "react";
import type { SiteDto, UnregisteredFormDto } from "@epi/shared";
import { Button, Card, Dropdown, Label, Modal } from "../../shared/components";
import type { DropdownOption } from "../../shared/components";
import { surveyApi } from "./api";
import { useI18n } from "../../lib/i18n";

/**
 * Formularios de Jotform que ya mandaron respuestas pero nunca se
 * asociaron a un sitio/tipo — el sistema los deja pendientes y aquí es
 * donde el admin los da de alta (crea la SurveyDefinition + preguntas).
 */
export function UnregisteredForms({ onRegistered }: { onRegistered: () => void }) {
  const { t } = useI18n();
  const TYPE_OPTIONS: DropdownOption[] = [
    { label: t("unregistered.typeLocal"), value: "LOCAL" },
    { label: t("unregistered.typeVisiting"), value: "VISITING" },
  ];
  const [forms, setForms] = useState<UnregisteredFormDto[]>([]);
  const [sites, setSites] = useState<SiteDto[]>([]);
  const [target, setTarget] = useState<UnregisteredFormDto | null>(null);
  const [siteId, setSiteId] = useState("");
  const [type, setType] = useState<"LOCAL" | "VISITING">("LOCAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    void surveyApi.unregisteredForms().then(setForms).catch(() => {});
  };

  useEffect(() => {
    load();
    void surveyApi.sites().then(setSites).catch(() => {});
  }, []);

  function openModal(form: UnregisteredFormDto) {
    setTarget(form);
    setSiteId("");
    setType("LOCAL");
    setError(null);
  }

  async function associate() {
    if (!target || !siteId) return;
    setSaving(true);
    setError(null);
    try {
      await surveyApi.registerDefinition({ jotformFormId: target.jotformFormId, siteId, type });
      setTarget(null);
      load();
      onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("unregistered.error"));
    } finally {
      setSaving(false);
    }
  }

  if (forms.length === 0) return null;

  const siteOptions: DropdownOption[] = [
    { label: t("unregistered.selectSitePlaceholder"), value: "" },
    ...sites.map((s) => ({ label: s.name, value: s.id })),
  ];

  return (
    <Card>
      <Label variant="subtitle" className="mb-1 block">
        {t("unregistered.title")}
      </Label>
      <p className="mb-4 text-sm text-gray-500">
        {t("unregistered.body")}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-gray-500">
              <th className="py-2 font-medium">{t("unregistered.table.formId")}</th>
              <th className="py-2 font-medium">{t("unregistered.table.responses")}</th>
              <th className="py-2 font-medium">{t("unregistered.table.since")}</th>
              <th className="py-2 font-medium">{t("unregistered.table.detectedFields")}</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {forms.map((f) => (
              <tr key={f.jotformFormId}>
                <td className="py-2 font-mono text-xs text-gray-800">{f.jotformFormId}</td>
                <td className="py-2 text-gray-600">{f.count}</td>
                <td className="py-2 text-gray-600">{new Date(f.firstReceivedAt).toLocaleDateString()}</td>
                <td className="py-2 text-gray-500">
                  <span className="line-clamp-1 max-w-xs">{f.sampleExternalIds.join(", ")}</span>
                </td>
                <td className="py-2 text-right">
                  <Button size="sm" onClick={() => openModal(f)}>
                    {t("unregistered.associate")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={target !== null}
        onClose={() => setTarget(null)}
        title={`${t("unregistered.associateTitlePrefix")} ${target?.jotformFormId ?? ""}`}
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
          <p className="text-sm text-gray-600">
            {t("unregistered.modalBodyPrefix")} {target?.sampleExternalIds.length ?? 0}{" "}
            {t("unregistered.modalBodySuffix")}
          </p>
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

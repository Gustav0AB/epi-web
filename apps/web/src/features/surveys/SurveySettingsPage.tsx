import { useCallback, useEffect, useState } from "react";
import type { SurveyDefinitionDto } from "@epi/shared";
import { Label } from "../../shared/components";
import { JotformFormsCatalog } from "./JotformFormsCatalog";
import { UnregisteredForms } from "./UnregisteredForms";
import { HistoricalMigration } from "./HistoricalMigration";
import { surveyApi } from "./api";
import { useI18n } from "../../lib/i18n";

export function SurveySettingsPage() {
  const { t } = useI18n();
  const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);

  const loadDefinitions = useCallback(() => {
    void surveyApi.definitions().then(setDefinitions).catch(() => {});
  }, []);

  useEffect(() => {
    loadDefinitions();
  }, [loadDefinitions]);

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">
          {t("surveySettings.title")}
        </Label>
        <p className="mt-0.5 text-sm text-gray-500">{t("surveySettings.subtitle")}</p>
      </div>

      <JotformFormsCatalog onRegistered={loadDefinitions} />
      <UnregisteredForms onRegistered={loadDefinitions} />
      <HistoricalMigration definitions={definitions} onImported={loadDefinitions} />
    </div>
  );
}

import { useSearchParams } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import type { SurveyDefinitionDto } from "@epi/shared";
import { Label } from "../../shared/components";
import { JotformFormsCatalog } from "./JotformFormsCatalog";
import { UnregisteredForms } from "./UnregisteredForms";
import { surveyApi } from "./api";
import { useI18n } from "../../lib/i18n";
import { useAuthStore } from "../../store/auth.store";

export function SurveySettingsPage() {
  const { t } = useI18n();
  const [search] = useSearchParams();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [, setDefinitions] = useState<SurveyDefinitionDto[]>([]);

  const loadDefinitions = useCallback(() => {
    void surveyApi
      .definitions()
      .then(setDefinitions)
      .catch(() => {});
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
        <p className="mt-0.5 text-sm text-gray-500">
          {t("surveySettings.subtitle")}
        </p>
      </div>

      {currentUser?.role === "system_admin" && (
        <>
          <JotformFormsCatalog onRegistered={loadDefinitions} configureFormId={search.get("configureForm") ?? undefined} />
          <UnregisteredForms onRegistered={loadDefinitions} />
        </>
      )}

    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import type { QuestionWithWeight, SurveyDefinitionDto } from "@epi/shared";
import { Button, Card, Dropdown, Label } from "../../shared/components";
import type { DropdownOption } from "../../shared/components";
import { surveyApi } from "../surveys/api";
import { useI18n } from "../../lib/i18n";

export function OpenQuestionsPage() {
  const { t } = useI18n();
  const [definitions, setDefinitions] = useState<SurveyDefinitionDto[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [questions, setQuestions] = useState<QuestionWithWeight[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void surveyApi.definitions().then(setDefinitions).catch(() => {});
  }, []);

  const loadQuestions = useCallback(async (defId: string) => {
    if (!defId) return;
    setLoading(true);
    try {
      const qs = await surveyApi.questions(defId);
      setQuestions(qs.filter((q) => q.type === "OPEN_TEXT"));
    } finally {
      setLoading(false);
    }
  }, []);

  function selectDefinition(id: string) {
    setSelectedId(id);
    setError(null);
    void loadQuestions(id);
  }

  async function analyze(questionId: string) {
    setAnalyzingId(questionId);
    setError(null);
    try {
      await surveyApi.analyzeQuestion(questionId);
      await loadQuestions(selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("openQuestions.analyzeError"));
    } finally {
      setAnalyzingId(null);
    }
  }

  const definitionOptions: DropdownOption[] = [
    { label: t("scoring.selectPlaceholder"), value: "" },
    ...definitions.map((d) => ({ label: d.title, value: d.id })),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Label variant="title" className="block">
          {t("openQuestions.title")}
        </Label>
        <p className="mt-0.5 text-sm text-gray-500">{t("openQuestions.subtitle")}</p>
      </div>

      <Card>
        <div className="min-w-64">
          <Dropdown
            label={t("scoring.selectSurvey")}
            options={definitionOptions}
            value={selectedId}
            onChange={selectDefinition}
          />
        </div>
      </Card>

      {error && <p className="text-sm text-danger">{error}</p>}

      {selectedId && !loading && questions.length === 0 && (
        <p className="text-sm text-gray-500">{t("openQuestions.empty")}</p>
      )}

      {loading && <p className="text-sm text-gray-500">{t("table.loading")}</p>}

      <div className="space-y-4">
        {questions.map((q) => (
          <Card key={q.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="font-mono text-xs text-gray-400">{q.externalId}</span>
                <p className="text-gray-800">{q.text}</p>
              </div>
              <Button size="sm" loading={analyzingId === q.id} onClick={() => void analyze(q.id)}>
                {q.insight ? t("openQuestions.reanalyze") : t("openQuestions.analyze")}
              </Button>
            </div>

            {q.insight ? (
              <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {t("openQuestions.summary")}
                  </p>
                  <p className="mt-1 text-sm text-gray-800">{q.insight.summary}</p>
                </div>
                {q.insight.bestAnswers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {t("openQuestions.bestAnswers")}
                    </p>
                    <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-gray-800">
                      {q.insight.bestAnswers.map((a, i) => (
                        <li key={i}>
                          “{a.text}” <span className="text-gray-500">— {a.reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="text-xs text-gray-400">
                  {t("openQuestions.generatedAt")}: {new Date(q.insight.generatedAt).toLocaleString()} ({q.insight.model})
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-gray-400">{t("openQuestions.noInsightYet")}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

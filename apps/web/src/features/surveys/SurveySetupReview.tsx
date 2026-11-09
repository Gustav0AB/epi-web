import { useMemo, useState } from "react";
import { canConfigureAnalysis, QUESTION_ROLES, type SurveySetupQuestion } from "@epi/shared";
import { useI18n } from "../../lib/i18n";
import { Badge, Dropdown, Table } from "@epi/ui";
import { analysisScoringText } from "./SetupAnalysisScoring";

type Question = SurveySetupQuestion & { options: string[] };
type RoleFilter = "all" | (typeof QUESTION_ROLES)[number];

export function matchesReviewRole(question: SurveySetupQuestion, role: RoleFilter) {
  if (role === "all") return true;
  if (role === "FILTER") return question.isFilter === true || question.role === "FILTER";
  if (role === "SCORED") return canConfigureAnalysis(question);
  return question.role === role;
}

function CompactText({ text, width }: { text: string; width: string }) {
  return <details className={width}>
    <summary className="cursor-pointer truncate" title={text}>{text}</summary>
    <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-words">{text}</p>
  </details>;
}

export function SurveySetupReview({ questions, quality }: { questions: Question[]; quality: boolean }) {
  const { t } = useI18n();
  const [role, setRole] = useState<RoleFilter>("all");
  const rows = useMemo(() => questions.filter(question => !question.sourceContext?.matrixParent && matchesReviewRole(question, role)), [questions, role]);
  return <section className="space-y-2">
    <div className="flex flex-wrap items-end gap-3">
      <Dropdown label="Filtrar revisión por rol" value={role} options={[{ value: "all", label: "Todos los roles" }, ...QUESTION_ROLES.map(value => ({ value, label: value === "SCORED" ? "Evaluables" : value === "FILTER" ? "Filtro" : t(`surveySetup.roles.${value}`) }))]} onChange={setRole} />
      <p role="status" className="pb-1 text-sm">{rows.length} preguntas</p>
    </div>
    <Table rows={rows} pageSize={10} keyExtractor={question => question.externalId} emptyText="No hay preguntas con este rol." columns={[
      { key: "text", header: t("jotformCatalog.question"), render: question => <CompactText text={question.text} width="w-44" /> },
      { key: "role", header: "Tipo y rol", render: question => <div className="min-w-28 space-y-1"><p>{t(`surveySetup.types.${question.type}`)}</p><Badge>{t(`surveySetup.roles.${question.role ?? "SCORED"}`)}</Badge>{question.isFilter && question.role !== "FILTER" && <Badge color="blue">Filtro</Badge>}</div> },
      { key: "classification", header: "Categoría / Subcategoría", render: question => <div className="w-32 break-words">{question.classification?.category || "—"}{question.classification?.subcategory && <p className="text-xs">{question.classification.subcategory}</p>}</div> },
      { key: "score", header: "Puntuación", render: question => !canConfigureAnalysis(question) ? "—" : quality ? "CQS pendiente" : <CompactText text={analysisScoringText(question)} width="w-40" /> },
      { key: "answers", header: "Respuestas", render: question => !question.options.length ? "—" : <details className="w-28">
        <summary className="cursor-pointer whitespace-nowrap">{question.options.length} opciones</summary>
        <ul className="mt-1 max-h-48 list-disc space-y-1 overflow-y-auto break-words pl-4">{question.options.map((value, index) => {
          const label = question.optionLabels?.find(item => item.value === value)?.label;
          const moment = question.role === "MOMENT" ? question.momentMappings?.find(item => item.value === value)?.moment : undefined;
          return <li key={index}>{value}{label && label !== value && ` · ${label}`}{moment && ` → ${t(`surveySetup.moments.${moment}`)}`}</li>;
        })}</ul>
      </details> },
    ]} />
  </section>;
}

import { useId, useState } from "react";
import { equalWeights, scoringGroups, type CategoryWeightSetting, type QuestionVisibility, type SubcategoryWeightSetting, type SurveySetupQuestion } from "@epi/shared";
import { useEffect } from "react";
import { Button, Dropdown, Label, Pagination, Table, TextField } from "../../shared/components";
import { useI18n } from "../../lib/i18n";

type Question = SurveySetupQuestion & { options: string[]; visibility?: QuestionVisibility };
const evaluable = (question: Question) => (question.role ?? "SCORED") === "SCORED" && question.type !== "OPEN_TEXT";
const group = (question: Question) => JSON.stringify([question.weight?.category.trim(), question.weight?.subcategory?.trim() || null]);
const validFactor = (value: number) => Number.isInteger(value) && value >= 1 && value <= 10;
export function questionInfluence(question: Question, questions: Question[]): number | null {
  if (!evaluable(question) || !question.weight?.category.trim()) return null;
  const peers = questions.filter(peer => evaluable(peer) && group(peer) === group(question));
  const factors = peers.map(peer => peer.weight?.factor ?? 1);
  if (!factors.every(validFactor)) return null;
  return (question.weight.factor ?? 1) / factors.reduce((sum, factor) => sum + factor, 0) * 100;
}

export function SetupWeightsTable({ groupsOnly = false, includeIaa = true, questions, categoryWeights = [], subcategoryWeights = [], onQuestionChange, onChange, onCategoryWeightsChange = () => {}, onSubcategoryWeightsChange = () => {} }: {
  groupsOnly?: boolean;
  includeIaa?: boolean;
  questions: Question[];
  categoryWeights?: CategoryWeightSetting[];
  subcategoryWeights?: SubcategoryWeightSetting[];
  onQuestionChange?: (question: Question) => void;
  onChange?: (question: Question) => void;
  onCategoryWeightsChange?: (weights: CategoryWeightSetting[]) => void;
  onSubcategoryWeightsChange?: (weights: SubcategoryWeightSetting[]) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const [page, setPage] = useState(1);
  const rows = questions.filter(evaluable);
  const groups = scoringGroups(questions);
  const categories = [...new Set(groups.map(group => group.category))];
  useEffect(() => {
    if (groupsOnly) return;
    const nextCategories = includeIaa ? categories.map(category => categoryWeights.find(item => item.category === category) ?? { category, weight: null }) : [];
    const nextSubcategories = groups.map(group => subcategoryWeights.find(item => item.category === group.category && item.subcategory === group.subcategory) ?? { category: group.category, subcategory: group.subcategory, weight: null });
    if (JSON.stringify(nextCategories) !== JSON.stringify(categoryWeights)) onCategoryWeightsChange(nextCategories);
    if (JSON.stringify(nextSubcategories) !== JSON.stringify(subcategoryWeights)) onSubcategoryWeightsChange(nextSubcategories);
  }, [questions, categoryWeights, subcategoryWeights, includeIaa, groupsOnly]);
  const totalPages = Math.ceil(rows.length / 10);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  function update(question: Question, patch: Partial<NonNullable<Question["weight"]>>) {
    (onQuestionChange ?? onChange)?.({ ...question, weight: { category: "", subcategory: null, maxScore: null, correctAnswer: null, factor: 1, ...question.weight, ...patch } });
  }
  function proposedQuestionMaximum(category: string, subcategory: string) {
    const group = groups.find(item => item.category === category && item.subcategory === subcategory);
    const weight = subcategoryWeights.find(item => item.category === category && item.subcategory === subcategory)?.weight;
    if (!group || weight == null || !Number.isFinite(weight) || weight < 0 || weight > 100) return null;
    return group.categoryQuestionCount * weight / 100 / group.questionCount;
  }
  return <div className="space-y-3">
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">Ponderaciones y máximos calculados: metodología propuesta, pendiente de aprobación. Estos valores no deben usarse para publicar resultados definitivos.</p>
    <Label variant="subtitle">Peso de subcategorías dentro de cada categoría</Label>
    {categories.map(category => {
      const categoryGroups = groups.filter(group => group.category === category);
      const sum = subcategoryWeights.filter(item => item.category === category).reduce((total, item) => total + (item.weight ?? 0), 0);
      return <section key={category} className="space-y-2 rounded border p-3">
        <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{category} · total: {sum.toFixed(2)}%</h3><Button size="sm" variant="secondary" onClick={() => {
          const equal = equalWeights(categoryGroups.map(group => ({ category, subcategory: group.subcategory })));
          onSubcategoryWeightsChange([...subcategoryWeights.filter(item => item.category !== category), ...equal]);
        }}>Sugerir distribución equitativa</Button></div>
        <Table rows={categoryGroups} keyExtractor={group => group.subcategory} columns={[
          { key: "subcategory", header: "Subcategoría" },
          { key: "questionCount", header: "Preguntas", align: "right" },
          { key: "weight", header: "Peso (%)", render: group => <TextField aria-label={`Peso de ${category} / ${group.subcategory}`} type="number" min={0} max={100} step="any" value={subcategoryWeights.find(item => item.category === category && item.subcategory === group.subcategory)?.weight ?? ""} onChange={event => {
            const weight = event.target.value === "" ? null : Number(event.target.value);
            onSubcategoryWeightsChange([...subcategoryWeights.filter(item => !(item.category === category && item.subcategory === group.subcategory)), { category, subcategory: group.subcategory, weight }]);
          }} /> },
          { key: "maxQuestion", header: "Máximo por pregunta", align: "right", render: group => proposedQuestionMaximum(category, group.subcategory)?.toFixed(4) ?? "—" },
          { key: "maxSubcategory", header: "Máximo subcategoría", align: "right", render: group => { const weight = subcategoryWeights.find(item => item.category === category && item.subcategory === group.subcategory)?.weight; return weight === null || weight === undefined ? "—" : (group.categoryQuestionCount * weight / 100).toFixed(4); } },
        ]} />
        <p className={`text-sm ${Math.abs(sum - 100) < 1e-8 ? "text-green-700" : "text-amber-700"}`}>{Math.abs(sum - 100) < 1e-8 ? "Suma 100%" : "La suma de las subcategorías debe ser 100%."} · Máximo de categoría propuesto: {categoryGroups[0]?.categoryQuestionCount ?? 0}</p>
      </section>;
    })}
    {includeIaa && <>
    <div className="flex items-center justify-between gap-2"><Label variant="subtitle">Peso de categorías en el Índice de Alfabetización Ambiental</Label><Button size="sm" variant="secondary" onClick={() => onCategoryWeightsChange(equalWeights(categories.map(category => ({ category }))))}>Sugerir distribución equitativa</Button></div>
    <Table rows={categories.map(category => ({ category, weight: categoryWeights.find(item => item.category === category)?.weight ?? null }))} keyExtractor={row => row.category} columns={[
      { key: "category", header: "Categoría" },
      { key: "weight", header: "Peso IAA (%)", render: row => <TextField aria-label={`Peso IAA de ${row.category}`} type="number" min={0} max={100} step="any" value={row.weight ?? ""} onChange={event => onCategoryWeightsChange([...categoryWeights.filter(item => item.category !== row.category), { category: row.category, weight: event.target.value === "" ? null : Number(event.target.value) }])} /> },
    ]} />
    <p className="text-sm">Total IAA: {categoryWeights.reduce((sum, item) => sum + (item.weight ?? 0), 0).toFixed(2)}% · La suma de categorías debe ser 100%.</p>
    </>}
    {!groupsOnly && <>
    <Label variant="subtitle">Puntuación de preguntas</Label>
    <Table rows={rows.slice((currentPage - 1) * 10, currentPage * 10)} keyExtractor={question => question.externalId} emptyText={t("jotformCatalog.noQuestions")} columns={[
      { key: "category", header: t("surveySetup.categoryAndSubcategory"), render: question => <div className="max-w-36 break-words"><p>{question.weight?.category || "—"}</p><p className="text-xs text-gray-500">{question.weight?.subcategory}</p></div> },
      { key: "text", header: t("jotformCatalog.question"), render: question => <div>{(question.visibility?.hidden || !!question.visibility?.rules.length) && <span className="text-xs text-amber-700">Condicional</span>}<details className="w-44"><summary className="cursor-pointer truncate" title={question.text}>{question.text}</summary><p className="mt-2 whitespace-pre-wrap break-words">{question.text}</p></details></div> },
      { key: "maxScore", header: "Máximo de escala", render: question => <TextField id={`${id}-${question.externalId}-max`} aria-label={`Máximo de escala: ${question.text}`} className="w-20" type="number" min={0} step="any" value={question.weight?.maxScore ?? ""} onChange={event => update(question, { maxScore: event.target.value === "" ? null : Number(event.target.value) })} /> },
      { key: "calculatedMaximum", header: "Máximo calculado (provisional)", render: question => proposedQuestionMaximum(question.weight?.category ?? "", question.weight?.subcategory ?? "")?.toFixed(4) ?? "—" },
      { key: "subcategoryWeight", header: "Peso de subcategoría", render: question => {
        const weight = subcategoryWeights.find(item => item.category === question.weight?.category && item.subcategory === question.weight?.subcategory)?.weight;
        return weight == null || !Number.isFinite(weight) || weight < 0 || weight > 100 ? "—" : `${weight}%`;
      } },
      { key: "answer", header: t("surveySetup.correctOrScale"), render: question => question.type === "ONE_ANSWER" ? question.options.length ? <Dropdown id={`${id}-${question.externalId}-answer`} aria-label={`${t("surveySetup.weightAnswer")}: ${question.text}`} value={question.weight?.correctAnswer ?? ""} options={[{ value: "", label: t("surveySetup.select") }, ...question.options.map(value => ({ value, label: value }))]} onChange={value => update(question, { correctAnswer: value || null })} /> : <TextField id={`${id}-${question.externalId}-answer`} aria-label={`${t("surveySetup.weightAnswer")}: ${question.text}`} value={question.weight?.correctAnswer ?? ""} onChange={event => update(question, { correctAnswer: event.target.value || null })} /> : <span>{t(`surveySetup.types.${question.type}`)}</span> },
      { key: "influence", header: t("surveySetup.influence"), render: question => {
        const match = groups.find(item => item.category === question.weight?.category && item.subcategory === question.weight?.subcategory);
        return <span>{match ? `${(100 / match.questionCount).toFixed(1)}%` : "—"}</span>;
      } },
    ]} />
    <Pagination meta={{ page: currentPage, pageSize: 10, total: rows.length, totalPages }} onPageChange={setPage} />
    </>}
  </div>;
}

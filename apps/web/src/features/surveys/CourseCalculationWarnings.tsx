import type { CourseResultsDto } from "@epi/shared";
import { Card } from "@epi/ui";

export function CourseCalculationWarnings({ result }: { result: CourseResultsDto }) {
  const warnings = result.groups.flatMap(group => (["pre", "post"] as const).flatMap(moment => {
    const questions = result.questions.filter(question => question.definitionId === group.definitionId && question.category === group.category && question.subcategory === group.subcategory);
    const blanks = questions.reduce((sum, question) => sum + question[moment].blank, 0);
    if (!blanks) return [];
    const aggregate = result.aggregates.find(row => row.definitionId === group.definitionId && row.level === "subcategory" && row.category === group.category && row.subcategory === group.subcategory);
    const weights = aggregate?.[moment === "pre" ? "preEffectiveWeights" : "postEffectiveWeights"] ?? [];
    const omitted = questions.filter(question => question.configurationReady && question.factor > 0 && !weights.some(weight => weight.key === question.id));
    const adjustment = aggregate?.issue ? "El cálculo requiere revisar la configuración."
      : !weights.length ? "No hay preguntas con datos válidos para calcular este resultado."
      : omitted.length ? `El peso se redistribuyó proporcionalmente entre ${weights.length} preguntas con datos válidos. Pesos efectivos: ${weights.map(weight => `${questions.find(question => question.id === weight.key)?.text ?? "Pregunta"}: ${weight.weight.toFixed(2)}%`).join("; ")}.`
      : "Los promedios consideran las respuestas válidas de cada pregunta. Todas las preguntas conservan participación en la ponderación.";
    return [{ key: JSON.stringify([group.definitionId, group.category, group.subcategory, moment]), title: `${group.instrument} · ${group.category ?? "Categoría pendiente"} / ${group.subcategory ?? "Subcategoría pendiente"} · ${moment === "pre" ? "Pre" : "Post"}`, blanks, adjustment }];
  }));
  if (!warnings.length) return null;
  return <Card><details><summary className="cursor-pointer font-semibold">Advertencias del cálculo · {warnings.length} grupos con observaciones</summary><ul className="mt-4 space-y-4">{warnings.map(warning => <li key={warning.key}><h3 className="font-medium">{warning.title}</h3><p>{warning.blanks} respuestas en blanco o ausentes quedaron fuera del cálculo.</p><p className="text-sm">{warning.adjustment}</p></li>)}</ul></details></Card>;
}

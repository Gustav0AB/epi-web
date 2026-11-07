import type { QuestionVisibility, SurveySetupQuestion } from "@epi/shared";

type Question = Pick<SurveySetupQuestion, "externalId" | "text" | "role" | "momentMappings">;
export function QuestionVisibilityRules({ visibility, questions }: { visibility: QuestionVisibility; questions: Question[] }) {
  return <div className="space-y-2 rounded bg-amber-50 p-3 text-sm text-gray-800">
    {visibility.hidden && <p>Oculta inicialmente en Jotform.</p>}
    {!visibility.rules.length && <p>No hay una regla de aparición interpretable para esta pregunta.</p>}
    {visibility.rules.map((rule, index) => <div key={`${rule.id}-${index}`}>
      <p className="font-medium">{rule.action === "show" ? "Mostrar" : "Ocultar"} cuando se cumplan {rule.link.toLowerCase() === "any" ? "alguna de las condiciones" : "todas las condiciones"}:</p>
      <ul className="list-inside list-disc break-words">{rule.terms.map((term, termIndex) => {
        const source = questions.find(question => question.externalId === term.field);
        const moment = source?.role === "MOMENT" ? source.momentMappings?.find(mapping => mapping.value === term.value)?.moment : undefined;
        return <li key={termIndex}>{source?.text ?? "Campo no reconocido"} · {term.operator} · {term.value}{moment ? ` (momento ${moment})` : ""}</li>;
      })}</ul>
    </div>)}
  </div>;
}

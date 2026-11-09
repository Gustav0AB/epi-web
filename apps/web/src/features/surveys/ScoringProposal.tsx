import { useState } from "react";
import type { AnalysisType, SurveySetupQuestion } from "@epi/shared";
import { Button } from "@epi/ui";
import { applyAutomaticScoringProposal } from "./setup-scoring-proposal";

type Question = SurveySetupQuestion & { options: string[] };
export function ScoringProposal({ questions, analysis, onApply }: { questions: Question[]; analysis: AnalysisType; onApply: (questions: SurveySetupQuestion[]) => void }) {
  const [applied, setApplied] = useState<number | null>(null);
  return <section className="space-y-2 rounded border p-3">
    <h4 className="font-semibold">Propuesta de puntuación</h4>
    <p className="text-sm">Aplica al borrador el número de opciones como máximo y distribuye los puntos de mayor a menor. Puedes ajustar el máximo y la inversión en la tabla. La propuesta no decide respuestas correctas ni dirección inversa, y conserva las reglas y ponderaciones existentes.</p>
    <Button variant="secondary" onClick={() => {
      const updated = applyAutomaticScoringProposal(questions, analysis);
      const count = updated.filter((question, index) => question !== questions[index]).length;
      if (count) onApply(updated);
      setApplied(count);
    }}>Generar propuesta de puntuación</Button>
    {applied !== null && <p role="status" className="text-sm">{applied > 0 ? `Puntuación aplicada a ${applied} escalas del borrador.` : "No hay escalas sin regla a las que aplicar una propuesta."}</p>}
  </section>;
}

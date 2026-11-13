import type { SurveySetupQuestion } from "./schemas/survey.schema.js";

type ContextQuestion = SurveySetupQuestion & { options: string[] };

export function incompleteLearningMoment(question: Pick<ContextQuestion, "options" | "momentMappings">): boolean {
  const mappings = question.momentMappings ?? [];
  return !mappings.some(item => item.moment === "PRE" && question.options.includes(item.value)) ||
    !mappings.some(item => item.moment === "POST" && question.options.includes(item.value)) ||
    mappings.some(item => !question.options.includes(item.value) || !["PRE", "POST"].includes(item.moment));
}

export function learningContextIssues(questions: ContextQuestion[]): string[] {
  const schools = questions.filter(question => question.role === "SCHOOL_GROUP");
  const moments = questions.filter(question => question.role === "MOMENT");
  const issues: string[] = [];
  if (schools.length !== 1) issues.push("Selecciona una pregunta como Escuela / grupo.");
  if (moments.length !== 1) issues.push("Selecciona una pregunta como Momento.");
  else {
    if (incompleteLearningMoment(moments[0]!)) {
      issues.push("Relaciona al menos una respuesta con Pre y otra con Post; las opciones sin asignar quedarán para revisión.");
    }
  }
  return issues;
}

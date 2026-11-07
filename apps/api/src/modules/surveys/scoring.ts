// Motor de ponderación. Puro y sin dependencias: fácil de verificar aislado.
// ponytail: el rubro de puntuación es la perilla de calibración del negocio.
// Si mañana un Likert 1-5 debe normalizarse a 0-100, se ajusta AQUÍ.

export type QuestionType = "LIKERT" | "ONE_ANSWER" | "FREQUENCY";

export type ScoreInput = {
  type: QuestionType;
  value: string;
  maxScore: number;
  correctAnswer?: string | null;
};

/** Puntaje de una sola respuesta según el tipo de pregunta. */
export function scoreAnswer({ type, value, maxScore, correctAnswer }: ScoreInput): number {
  switch (type) {
    case "ONE_ANSWER":
      return value.trim() === (correctAnswer ?? "").trim() ? maxScore : 0;
    case "LIKERT":
    case "FREQUENCY": {
      // El valor numérico de la escala; acotado a [0, maxScore].
      const n = Number(value);
      if (Number.isNaN(n)) return 0;
      return Math.max(0, Math.min(n, maxScore));
    }
  }
}

export type Scored = {
  category: string;
  subcategory: string | null;
  score: number;
  max: number; // maxScore de la pregunta; permite calcular % excluyendo las no respondidas
};

/** Suma puntajes y máximos agrupando por (category, subcategory). */
export function aggregate(scored: Scored[]): Scored[] {
  const buckets = new Map<string, Scored>();
  for (const s of scored) {
    const key = `${s.category}||${s.subcategory ?? ""}`;
    const acc = buckets.get(key);
    if (acc) {
      acc.score += s.score;
      acc.max += s.max;
    } else buckets.set(key, { ...s });
  }
  return [...buckets.values()];
}

export function overallImprovement(questions: { pre: number | null; post: number | null; excluded: boolean }[]): number | null {
  const comparable = questions.filter((q) => !q.excluded && q.pre !== null && q.post !== null);
  return comparable.length ? Math.round(comparable.reduce((sum, q) => sum + q.post! - q.pre!, 0) / comparable.length * 10) / 10 : null;
}

export function categoryQuestionResults(questions: { category: string; subcategory: string | null; pre: number | null; post: number | null; excluded: boolean }[]) {
  const groups = new Map<string, typeof questions>();
  for (const question of questions) {
    if (question.excluded || (question.pre === null && question.post === null)) continue;
    const key = JSON.stringify([question.category, question.subcategory]);
    const group = groups.get(key) ?? [];
    group.push(question);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => {
    const average = (moment: "pre" | "post") => {
      const values = group.flatMap((q) => q[moment] === null ? [] : [q[moment]!]);
      return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10 : null;
    };
    return { category: group[0]!.category, subcategory: group[0]!.subcategory, pre: average("pre"), post: average("post"), change: overallImprovement(group) };
  }).sort((a, b) => a.category.localeCompare(b.category) || (a.subcategory ?? "").localeCompare(b.subcategory ?? ""));
}

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

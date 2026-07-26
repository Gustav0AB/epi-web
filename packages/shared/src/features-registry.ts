export const FEATURE_KEYS = {
  HOME: "home",
  SURVEYS: "surveys",
  SCORING: "scoring",
  OPEN_QUESTIONS: "open_questions",
} as const;

export type FeatureKey = (typeof FEATURE_KEYS)[keyof typeof FEATURE_KEYS];

export type FeatureDefinition = {
  key: FeatureKey;
  name: string;
  description: string;
};

export const FEATURES_REGISTRY: Record<FeatureKey, FeatureDefinition> = {
  [FEATURE_KEYS.HOME]: {
    key: FEATURE_KEYS.HOME,
    name: "Home",
    description: "Access to the home dashboard",
  },
  [FEATURE_KEYS.SURVEYS]: {
    key: FEATURE_KEYS.SURVEYS,
    name: "Encuestas",
    description: "Visualizar y buscar encuestas recibidas",
  },
  [FEATURE_KEYS.SCORING]: {
    key: FEATURE_KEYS.SCORING,
    name: "Ponderaciones",
    description: "Configurar los puntos de las preguntas (manual o CSV)",
  },
  [FEATURE_KEYS.OPEN_QUESTIONS]: {
    key: FEATURE_KEYS.OPEN_QUESTIONS,
    name: "Preguntas abiertas",
    description: "Ver y analizar con IA las respuestas de las preguntas abiertas",
  },
};

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

export const FEATURE_KEYS = {
  HOME: "home",
  COMPONENTS: "components",
  USERS_MANAGEMENT: "users_management",
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
  [FEATURE_KEYS.COMPONENTS]: {
    key: FEATURE_KEYS.COMPONENTS,
    name: "Components",
    description: "UI components library",
  },
  [FEATURE_KEYS.USERS_MANAGEMENT]: {
    key: FEATURE_KEYS.USERS_MANAGEMENT,
    name: "User Management",
    description: "Manage users and their permissions",
  },
};

export const ALL_FEATURE_KEYS: FeatureKey[] = Object.values(FEATURE_KEYS);

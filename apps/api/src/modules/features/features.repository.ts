import { prisma } from "../../db/prisma.js";
import type { FeatureDefinition } from "@epi/shared";

export const featuresRepository = {
  async findAll() {
    return prisma.feature.findMany({ orderBy: { name: "asc" } });
  },

  async upsertMany(features: FeatureDefinition[]) {
    return prisma.$transaction(
      features.map((f) =>
        prisma.feature.upsert({
          where: { key: f.key },
          create: { key: f.key, name: f.name, description: f.description },
          update: { name: f.name, description: f.description },
        })
      )
    );
  },
};

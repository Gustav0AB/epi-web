import { featuresRepository } from "./features.repository.js";
import type { Feature } from "@epi/shared";

type RawFeature = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  createdAt: Date;
};

export const featuresService = {
  async getAll(): Promise<Feature[]> {
    const features = await featuresRepository.findAll();
    return features.map(mapToDto);
  },
};

function mapToDto(raw: RawFeature): Feature {
  return {
    id: raw.id,
    key: raw.key,
    name: raw.name,
    description: raw.description,
    createdAt: raw.createdAt.toISOString(),
  };
}

import { MUTATIONS_DATA } from '@data/mutationsData';
import { MUTATION_TIERS } from '@utils/tierUtils';
import type { MutationData as RawMutationData } from '@types';

export interface MutationData {
  id: string;
  name: string;
  tier: number;
  ground: string;
  requirements: Array<{ plant: string; count: number }>;
  size: string;
}

function transformMutationData(id: string, raw: RawMutationData): MutationData {
  const requirements: Array<{ plant: string; count: number }> = [];

  // Transform conditions into requirements array
  Object.entries(raw.conditions).forEach(([key, value]) => {
    if (key !== 'special' && key !== 'adjacent_crops' && typeof value === 'number') {
      requirements.push({ plant: key, count: value });
    }
  });

  return {
    id,
    name: raw.name,
    tier: MUTATION_TIERS[id] || 0,
    ground: raw.ground,
    requirements,
    size: raw.size,
  };
}

// Export all mutations in the transformed format
export const allMutations: MutationData[] = Object.entries(MUTATIONS_DATA).map(([id, data]) =>
  transformMutationData(id, data)
);

// Helper to get a single mutation by id
export function getMutation(id: string): MutationData | undefined {
  const raw = MUTATIONS_DATA[id];
  if (!raw) return undefined;
  return transformMutationData(id, raw);
}

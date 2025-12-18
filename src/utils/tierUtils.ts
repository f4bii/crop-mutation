import { getMutationData, MUTATIONS_DATA } from '@data/mutationsData';
import type { MutationTiers, GroupedMutationsByTier } from '@types';

// Tier calculation based on dependency depth
export const calculateTiers = (): MutationTiers => {
    const tiers: MutationTiers = {};
    const visited = new Set<string>();

    const getTier = (mutationId: string): number => {
        if (tiers[mutationId] !== undefined) return tiers[mutationId];
        if (visited.has(mutationId)) return 0;
        visited.add(mutationId);

        const mutation = getMutationData(mutationId);
        if (!mutation) return 0;

        const conditions = mutation.conditions;
        if (conditions.special) {
            tiers[mutationId] = 5;
            return 5;
        }

        let maxDepTier = -1;
        for (const dep of Object.keys(conditions)) {
            if (getMutationData(dep)) {
                maxDepTier = Math.max(maxDepTier, getTier(dep));
            }
        }

        tiers[mutationId] = maxDepTier + 1;
        visited.delete(mutationId);
        return tiers[mutationId];
    };

    Object.keys(MUTATIONS_DATA).forEach(id => getTier(id));
    return tiers;
};

export const MUTATION_TIERS: MutationTiers = calculateTiers();

export const groupMutationsByTier = (): GroupedMutationsByTier => {
    const groups: GroupedMutationsByTier = {};
    Object.entries(MUTATIONS_DATA).forEach(([id, mutation]) => {
        const tier = MUTATION_TIERS[id] || 0;
        if (!groups[tier]) groups[tier] = [];
        groups[tier].push({ id, ...mutation });
    });
    return groups;
};

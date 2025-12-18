import { getMutationData, MUTATIONS_DATA } from '@data/mutationsData';
import { BASE_CROPS, EXTRA_CONDITIONS } from '@data/constants';
import type { AvailableMutations } from '@types';

export function allMutations() {
    return Object.entries(MUTATIONS_DATA)
}


// Effect types that godseed needs (regular OR improved version counts)
export const GODSEED_REQUIRED_EFFECT_TYPES = [
    'harvest_boost',  // harvest_boost or improved_harvest_boost
    'water_retain',   // water_retain or improved_water_retain
    'xp_boost',       // xp_boost or improved_xp_boost
    'immunity',
    'bonus_drops',
    'effect_spread'   // effect_spread or improved_effect_spread
];

// Negative effects to avoid when selecting helper mutations
const NEGATIVE_EFFECTS = ['xp_loss', 'harvest_loss', 'water_drain'];

// Check if an effect satisfies a required effect type
export const effectSatisfiesType = (effect: string, requiredType: string): boolean => {
    return effect === requiredType || effect === `improved_${requiredType}`;
};

// Get mutations that provide positive effects and have no negative effects
const getPositiveEffectMutations = (): Array<{ id: string; effects: string[]; size: string }> => {
    const result: Array<{ id: string; effects: string[]; size: string }> = [];
    Object.entries(MUTATIONS_DATA).forEach(([id, mutation]) => {
        // Skip special condition mutations
        if (mutation.conditions.special) return;
        // Skip isolation mutations (adjacent_crops: 0)
        if (mutation.conditions.adjacent_crops === 0) return;
        // Skip mutations with negative effects
        if (mutation.effects.some(e => NEGATIVE_EFFECTS.includes(e))) return;
        // Must have at least one effect
        if (mutation.effects.length === 0) return;

        result.push({ id, effects: mutation.effects, size: mutation.size });
    });
    // Sort by size (1x1 first) then by number of useful effects (more is better)
    return result.sort((a, b) => {
        const [wa, ha] = a.size.split('x').map(Number);
        const [wb, hb] = b.size.split('x').map(Number);
        const sizeA = wa * ha;
        const sizeB = wb * hb;
        if (sizeA !== sizeB) return sizeA - sizeB;
        return b.effects.length - a.effects.length;
    });
};

// Get effect types already covered by a set of mutations
const getCoveredEffectTypes = (mutationIds: string[]): Set<string> => {
    const coveredTypes = new Set<string>();
    for (const mutId of mutationIds) {
        const mutation = getMutationData(mutId);
        if (!mutation) continue;
        for (const reqType of GODSEED_REQUIRED_EFFECT_TYPES) {
            if (mutation.effects.some(e => effectSatisfiesType(e, reqType))) {
                coveredTypes.add(reqType);
            }
        }
    }
    return coveredTypes;
};

/**
 * Calculate the minimal set of additional mutations needed for godseed to grow.
 *
 * @param selectedMutations - Currently selected mutations (will be placed around godseed)
 * @returns Object containing:
 *   - helperMutations: Array of mutation IDs to add
 *   - coveredTypes: Effect types already covered by selected mutations
 *   - missingTypes: Effect types that still need to be covered
 *   - allCovered: Whether all effect types are covered
 */
export const calculateGodseedHelpers = (
    selectedMutations: string[]
): { [key: string]: number } => {
    // Remove godseed itself
    const relevantMutations = selectedMutations.filter(id => id !== 'godseed');

    // Determine what effect types are already covered
    const coveredTypes = getCoveredEffectTypes(relevantMutations);

    // Determine missing types
    const missingTypes = GODSEED_REQUIRED_EFFECT_TYPES.filter(
        t => !coveredTypes.has(t)
    );

    // If nothing is missing, no helpers needed
    if (missingTypes.length === 0) {
        return {};
    }

    const positiveEffectMutations = getPositiveEffectMutations();
    const stillMissing = new Set(missingTypes);

    const result: { [key: string]: number } = {};

    // Greedy selection (same logic as original)
    while (stillMissing.size > 0) {
        let bestMutation: { id: string; effects: string[] } | null = null;
        let bestNewCoverage = 0;

        for (const mut of positiveEffectMutations) {
            // Skip mutations already selected or already chosen
            if (result[mut.id] || relevantMutations.includes(mut.id)) continue;

            let newCoverage = 0;
            for (const reqType of stillMissing) {
                if (mut.effects.some(e => effectSatisfiesType(e, reqType))) {
                    newCoverage++;
                }
            }

            if (newCoverage > bestNewCoverage) {
                bestNewCoverage = newCoverage;
                bestMutation = mut;
            }
        }

        // No further progress possible
        if (!bestMutation || bestNewCoverage === 0) break;

        // Mark mutation as needed once
        result[bestMutation.id] = 1;

        // Remove covered types
        for (const reqType of stillMissing) {
            if (bestMutation.effects.some(e => effectSatisfiesType(e, reqType))) {
                stillMissing.delete(reqType);
            }
        }
    }

    return result;
};

// Check if unlocked mutations can provide all positive effect types for godseed
const canCreateGodseed = (unlockedMutations: Set<string>): boolean => {
    const availableEffects = new Set<string>();
    unlockedMutations.forEach(mutId => {
        const mutation = getMutationData(mutId);
        if (mutation) {
            mutation.effects.forEach(effect => availableEffects.add(effect));
        }
    });
    // Check each required type is covered by at least one effect (regular or improved)
    return GODSEED_REQUIRED_EFFECT_TYPES.every(reqType =>
        [...availableEffects].some(effect => effectSatisfiesType(effect, reqType))
    );
};

// Get available mutations (ones we can try to create based on unlocked)
export const getAvailableMutations = (unlockedMutations: Set<string>): AvailableMutations => {
    const available: AvailableMutations = {};
    Object.entries(MUTATIONS_DATA).forEach(([id, mutation]) => {
        if (unlockedMutations.has(id)) return;

        // Special handling for godseed
        if (id === 'godseed') {
            if (canCreateGodseed(unlockedMutations)) {
                available[id] = mutation;
            }
            return;
        }

        if (mutation.conditions.special) return;

        const deps = Object.keys(mutation.conditions);
        const canCreate = deps.every(dep =>
            BASE_CROPS.includes(dep as any) ||
            EXTRA_CONDITIONS.includes(dep as any) ||
            unlockedMutations.has(dep) ||
            dep === 'adjacent_crops'
        );

        if (canCreate) {
            available[id] = mutation;
        }
    });
    return available;
};

export const allPositiveEffects = (unlockedMutations: AvailableMutations): AvailableMutations => {
    const available: AvailableMutations = {};
    const negativeEffects = ['xp_loss', 'harvest_loss', 'water_drain'];

    Object.entries(MUTATIONS_DATA).forEach(([id, mutation]) => {
        if (unlockedMutations[id]) return;
        if (mutation.conditions.special) return;

        // Check if mutation has only positive effects (no negative effects)
        const hasOnlyPositiveEffects = !mutation.effects.some(effect =>
            negativeEffects.includes(effect)
        );

        if (hasOnlyPositiveEffects && mutation.effects.length > 0) {
            available[id] = mutation;
        }
    });

    return available;
}
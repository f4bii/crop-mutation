import { getMutationData as getPersistentMutationData } from '@data/mutationsData';
import { calculateGodseedHelpers } from '../mutationUtils';
import { BASE_CROPS, EXTRA_CONDITIONS } from '@data/constants';
import type { MutationData, AvailableMutations } from '@types';
import type { ParsedMutation } from './types';

export class MutationParser {
    private readonly cache = new Map<string, ParsedMutation>();
    private readonly unlockedMutations: AvailableMutations;

    constructor(unlockedMutations: AvailableMutations) {
        this.unlockedMutations = unlockedMutations;
    }

    parse(id: string): ParsedMutation {
        const cached = this.cache.get(id);
        if (cached) return cached;

        const raw = this.getRawMutation(id);
        const [w, h] = raw.size.split('x').map(Number);

        const crops = new Map<string, number>();
        const mutations = new Map<string, number>();
        let requiresIsolation = false;

        for (const [key, value] of Object.entries(raw.conditions)) {
            if (key === 'adjacent_crops') {
                if (value === 0) requiresIsolation = true;
                continue;
            }
            if (key === 'special') continue;
            if (typeof value !== 'number') continue;

            if (this.isCropOrCondition(key)) {
                crops.set(key, value);
            } else {
                mutations.set(key, value);
            }
        }

        const parsed: ParsedMutation = {
            id,
            name: raw.name,
            size: [w, h],
            conditions: { crops, mutations, requiresIsolation },
            effects: raw.effects,
        };

        this.cache.set(id, parsed);
        return parsed;
    }

    private getRawMutation(id: string): MutationData {
        if (id === 'godseed') {
            const helpers = calculateGodseedHelpers(Object.keys(this.unlockedMutations));
            return {
                name: 'Godseed',
                size: '3x3',
                ground: 'farmland',
                drops: null,
                effects: ['improved_harvest_boost', 'improved_water_retain', 'improved_xp_boost',
                         'immunity', 'bonus_drops', 'improved_effect_spread'],
                conditions: helpers,
            };
        }
        return getPersistentMutationData(id);
    }

    private isCropOrCondition(key: string): boolean {
        return BASE_CROPS.includes(key as any) || EXTRA_CONDITIONS.includes(key as any);
    }

    hasSpreadEffect(mutation: ParsedMutation): boolean {
        return mutation.effects.some(e => e === 'effect_spread' || e === 'improved_effect_spread');
    }

    hasPositiveEffect(mutation: ParsedMutation): boolean {
        const positive = ['harvest_boost', 'improved_harvest_boost', 'water_retain', 'improved_water_retain',
                         'xp_boost', 'improved_xp_boost', 'immunity', 'bonus_drops', 'effect_spread', 'improved_effect_spread'];
        const negative = ['xp_loss', 'harvest_loss', 'water_drain'];
        return mutation.effects.some(e => positive.includes(e) && !negative.includes(e));
    }
}

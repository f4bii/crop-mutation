import { GRID_SIZE } from './constants';
import { MultiStrategyOptimizer } from './MultiStrategyOptimizer';
import { buildGrid } from './gridBuilder';
import type { TargetMutations, OptimizedLayout, AvailableMutations } from '@types';
import type { ScoreBreakdown } from './types';

export interface OptimizedLayoutWithScore extends OptimizedLayout {
    score: ScoreBreakdown;
    strategyUsed: string;
}

export const optimizeLayout = (
    unlockedMutations: AvailableMutations,
    targetMutations: TargetMutations,
    unlockedSlots: Set<string>
): OptimizedLayout => {
    if (targetMutations.size === 0) {
        return {
            grid: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
            mutations: [],
            unlockedSlots: new Set(unlockedSlots),
        };
    }

    const targets = Array.from(targetMutations.entries()).map(([mutationId, quantity]) => ({
        mutationId,
        quantity,
    }));

    const optimizer = new MultiStrategyOptimizer(unlockedMutations);
    const result = optimizer.optimize(targets, unlockedSlots);
    const { grid, mutations } = buildGrid(result.ctx, optimizer.getParser(), unlockedSlots);

    return { grid, mutations, unlockedSlots: new Set(unlockedSlots) };
};

export const optimizeLayoutWithScore = (
    unlockedMutations: AvailableMutations,
    targetMutations: TargetMutations,
    unlockedSlots: Set<string>
): OptimizedLayoutWithScore => {
    if (targetMutations.size === 0) {
        return {
            grid: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
            mutations: [],
            unlockedSlots: new Set(unlockedSlots),
            score: {
                mutationsPlaced: 0, mutationsRequested: 0, placementRate: 100,
                totalCropsUsed: 0, sharedCrops: 0, cropEfficiency: 100,
                compactnessScore: 100, synergiesFound: 0, totalScore: 1000,
            },
            strategyUsed: 'none',
        };
    }

    const targets = Array.from(targetMutations.entries()).map(([mutationId, quantity]) => ({
        mutationId,
        quantity,
    }));

    const optimizer = new MultiStrategyOptimizer(unlockedMutations);
    const result = optimizer.optimize(targets, unlockedSlots);
    const { grid, mutations } = buildGrid(result.ctx, optimizer.getParser(), unlockedSlots);

    return {
        grid,
        mutations,
        unlockedSlots: new Set(unlockedSlots),
        score: result.score,
        strategyUsed: result.strategy,
    };
};

export const optimizeLayoutAllStrategies = (
    unlockedMutations: AvailableMutations,
    targetMutations: TargetMutations,
    unlockedSlots: Set<string>
): OptimizedLayoutWithScore[] => {
    if (targetMutations.size === 0) {
        return [{
            grid: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
            mutations: [],
            unlockedSlots: new Set(unlockedSlots),
            score: {
                mutationsPlaced: 0, mutationsRequested: 0, placementRate: 100,
                totalCropsUsed: 0, sharedCrops: 0, cropEfficiency: 100,
                compactnessScore: 100, synergiesFound: 0, totalScore: 1000,
            },
            strategyUsed: 'none',
        }];
    }

    const targets = Array.from(targetMutations.entries()).map(([mutationId, quantity]) => ({
        mutationId,
        quantity,
    }));

    const optimizer = new MultiStrategyOptimizer(unlockedMutations);
    const results = optimizer.optimizeAll(targets, unlockedSlots);

    return results.map(r => {
        const { grid, mutations } = buildGrid(r.ctx, optimizer.getParser(), unlockedSlots);
        return {
            grid,
            mutations,
            unlockedSlots: new Set(unlockedSlots),
            score: r.score,
            strategyUsed: r.strategy,
        };
    });
};

// Re-export types
export type { ScoreBreakdown } from './types';

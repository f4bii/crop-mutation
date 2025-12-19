import type { MutationParser } from './MutationParser';
import type { PlacementContext } from './PlacementContext';
import type { FitnessState, ScoreBreakdown, MutationPlacement } from './types';

export class FitnessCalculator {
    private parser: MutationParser;

    // Cache for synergy calculations
    private synergyCache: Map<string, boolean> = new Map();

    constructor(parser: MutationParser) {
        this.parser = parser;
    }

    // Full recalculation (used after major changes or initial setup)
    recalculate(ctx: PlacementContext, targetCount: number): FitnessState {
        const placements = ctx.mutations.getAll();
        const state: FitnessState = {
            mutationCount: placements.length,
            targetCount,
            sharedCropCount: ctx.crops.getSharedCount(),
            totalCrops: ctx.crops.getTotalCount(),
            totalDistance: 0,
            distancePairs: 0,
            synergyCount: 0,
        };

        // Optimized distance calculation using incremental sum
        if (placements.length > 1) {
            const { totalDistance, pairs } = this.calculateDistanceMetrics(placements);
            state.totalDistance = totalDistance;
            state.distancePairs = pairs;
        }

        // Optimized synergy calculation with caching
        state.synergyCount = this.calculateSynergies(placements);

        return state;
    }

    // Incremental fitness update when a single mutation is moved
    incrementalUpdate(
        baseState: FitnessState,
        ctx: PlacementContext,
        removedPlacement: MutationPlacement | null,
        addedPlacement: MutationPlacement | null,
        targetCount: number
    ): FitnessState {
        const state = { ...baseState };
        const placements = ctx.mutations.getAll();

        // Update mutation count
        state.mutationCount = placements.length;
        state.targetCount = targetCount;

        // Update crop metrics from context (these are maintained incrementally by CropRegistry)
        state.sharedCropCount = ctx.crops.getSharedCount();
        state.totalCrops = ctx.crops.getTotalCount();

        // Recalculate distance (incremental is complex, full recalc is fast enough for small grids)
        if (placements.length > 1) {
            const { totalDistance, pairs } = this.calculateDistanceMetrics(placements);
            state.totalDistance = totalDistance;
            state.distancePairs = pairs;
        } else {
            state.totalDistance = 0;
            state.distancePairs = 0;
        }

        // Update synergies incrementally if possible
        if (removedPlacement && addedPlacement && removedPlacement.mutationId === addedPlacement.mutationId) {
            // Same mutation moved - can do incremental synergy update
            state.synergyCount = this.updateSynergiesForMove(placements, removedPlacement, addedPlacement);
        } else {
            // Full synergy recalculation
            state.synergyCount = this.calculateSynergies(placements);
        }

        return state;
    }

    private calculateDistanceMetrics(placements: MutationPlacement[]): { totalDistance: number; pairs: number } {
        let totalDistance = 0;
        let pairs = 0;

        // Use optimized loop for distance calculation
        const n = placements.length;
        for (let i = 0; i < n - 1; i++) {
            const p1 = placements[i];
            for (let j = i + 1; j < n; j++) {
                const p2 = placements[j];
                // Manhattan distance
                totalDistance += Math.abs(p1.position.x - p2.position.x) +
                    Math.abs(p1.position.y - p2.position.y);
                pairs++;
            }
        }

        return { totalDistance, pairs };
    }

    private calculateSynergies(placements: MutationPlacement[]): number {
        let synergyCount = 0;

        for (const p1 of placements) {
            // Check cache for spread effect
            const hasSpread = this.checkSpreadEffect(p1.mutationId);
            if (!hasSpread) continue;

            for (const p2 of placements) {
                if (p1.instanceId === p2.instanceId) continue;

                // Check cache for positive effect
                const hasPositive = this.checkPositiveEffect(p2.mutationId);
                if (!hasPositive) continue;

                const dist = Math.abs(p1.position.x - p2.position.x) +
                    Math.abs(p1.position.y - p2.position.y);
                if (dist <= 3) synergyCount++;
            }
        }

        return synergyCount;
    }

    private updateSynergiesForMove(
        placements: MutationPlacement[],
        _removed: MutationPlacement,
        _added: MutationPlacement
    ): number {
        // For a move of the same mutation, we can't easily do incremental
        // because synergies depend on all pairwise distances
        // Full recalculation is fast enough for typical grid sizes
        return this.calculateSynergies(placements);
    }

    private checkSpreadEffect(mutationId: string): boolean {
        const cacheKey = `spread:${mutationId}`;
        if (this.synergyCache.has(cacheKey)) {
            return this.synergyCache.get(cacheKey)!;
        }

        const mutation = this.parser.parse(mutationId);
        const hasSpread = this.parser.hasSpreadEffect(mutation);
        this.synergyCache.set(cacheKey, hasSpread);
        return hasSpread;
    }

    private checkPositiveEffect(mutationId: string): boolean {
        const cacheKey = `positive:${mutationId}`;
        if (this.synergyCache.has(cacheKey)) {
            return this.synergyCache.get(cacheKey)!;
        }

        const mutation = this.parser.parse(mutationId);
        const hasPositive = this.parser.hasPositiveEffect(mutation);
        this.synergyCache.set(cacheKey, hasPositive);
        return hasPositive;
    }

    // Convert fitness state to single score value (for SA acceptance criterion)
    toScore(state: FitnessState): number {
        const placementRate = state.targetCount > 0 ? state.mutationCount / state.targetCount : 1;
        const avgDistance = state.distancePairs > 0 ? state.totalDistance / state.distancePairs : 0;

        // Scoring weights - prioritize placement count and compactness
        const placementScore = placementRate * 2000;                    // High priority: place all mutations
        const compactnessScore = Math.max(0, 200 - avgDistance * 10);   // High priority: keep compact
        const sharingScore = state.sharedCropCount * 30;                // Medium priority: share crops
        const synergyScore = state.synergyCount * 20;                   // Lower priority: synergies
        const penaltyScore = (state.targetCount - state.mutationCount) * 3000; // Heavy penalty for missing mutations

        return placementScore + compactnessScore + sharingScore + synergyScore - penaltyScore;
    }

    // Create detailed breakdown for user display
    toBreakdown(state: FitnessState): ScoreBreakdown {
        const placementRate = state.targetCount > 0 ? (state.mutationCount / state.targetCount) * 100 : 100;
        const avgDistance = state.distancePairs > 0 ? state.totalDistance / state.distancePairs : 0;

        // Crop efficiency: lower is better (fewer crops per mutation)
        const avgCropsPerMutation = state.mutationCount > 0 ? state.totalCrops / state.mutationCount : 0;
        const cropEfficiency = Math.max(0, 100 - avgCropsPerMutation * 10);

        // Sharing bonus: percentage of crops serving multiple mutations
        const sharingBonus = state.totalCrops > 0 ? (state.sharedCropCount / state.totalCrops) * 20 : 0;

        return {
            mutationsPlaced: state.mutationCount,
            mutationsRequested: state.targetCount,
            placementRate,
            totalCropsUsed: state.totalCrops,
            sharedCrops: state.sharedCropCount,
            cropEfficiency: cropEfficiency + sharingBonus,
            compactnessScore: Math.max(0, 100 - avgDistance * 5),
            synergiesFound: state.synergyCount,
            totalScore: this.toScore(state),
        };
    }

    // Clear synergy cache (call when mutation data changes)
    clearCache(): void {
        this.synergyCache.clear();
    }
}

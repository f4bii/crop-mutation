import { STRATEGIES } from './constants';
import { MutationParser } from './MutationParser';
import { GreedySolver } from './GreedySolver';
import { SimulatedAnnealing } from './SimulatedAnnealing';
import { GeneticOptimizer } from './GeneticOptimizer';
import { BulkPlacer } from './BulkPlacer';
import { FitnessCalculator } from './FitnessCalculator';
import { Placer } from './Placer';
import { FeasibilityChecker } from './FeasibilityChecker';
import type { AvailableMutations } from '@types';
import type { PlacementContext } from './PlacementContext';
import type { ScoreBreakdown } from './types';

export class MultiStrategyOptimizer {
    private readonly parser: MutationParser;
    private readonly greedy: GreedySolver;
    private readonly sa: SimulatedAnnealing;
    private readonly ga: GeneticOptimizer;
    private readonly bulk: BulkPlacer;
    private readonly fitness: FitnessCalculator;
    private readonly placer: Placer;
    private readonly checker: FeasibilityChecker;

    constructor(unlockedMutations: AvailableMutations) {
        this.parser = new MutationParser(unlockedMutations);
        this.greedy = new GreedySolver(this.parser);
        this.sa = new SimulatedAnnealing(this.parser);
        this.ga = new GeneticOptimizer(this.parser);
        this.bulk = new BulkPlacer(this.parser);
        this.fitness = new FitnessCalculator(this.parser);
        this.placer = new Placer();
        this.checker = new FeasibilityChecker();
    }

    optimize(
        targets: Array<{ mutationId: string; quantity: number }>,
        unlockedSlots: Set<string>
    ): { ctx: PlacementContext; score: ScoreBreakdown; strategy: string } {
        const targetCount = targets.reduce((s, t) => s + t.quantity, 0);
        let best: { ctx: PlacementContext; score: ScoreBreakdown; strategy: string } | null = null;

        // Check if this is a bulk single-mutation request
        const dominantMutation = this.findDominantMutation(targets, targetCount);

        // Strategy 0: Bulk placement for single-mutation-dominant requests
        if (dominantMutation) {
            const bulkResult = this.bulk.placeBulk(dominantMutation.mutationId, dominantMutation.quantity, unlockedSlots);

            // Add any other mutations if present
            const otherTargets = targets.filter(t => t.mutationId !== dominantMutation.mutationId);
            if (otherTargets.length > 0) {
                this.addRemainingMutations(bulkResult.ctx, otherTargets);
            }

            // Refine with SA
            const profile = STRATEGIES[0];
            const optimized = this.sa.optimize(bulkResult.ctx, targetCount, profile);
            const state = this.fitness.recalculate(optimized, targetCount);
            const score = this.fitness.toBreakdown(state);

            if (score.totalScore > best!.score.totalScore) {
                best = { ctx: optimized, score, strategy: 'bulk-pattern-sa' };
            }
        }

        // Strategy 1: Traditional Greedy + SA approaches
        for (const profile of STRATEGIES) {
            // Greedy solution
            const { ctx } = this.greedy.solve(targets, unlockedSlots, profile);

            // Improve with SA
            const optimized = this.sa.optimize(ctx, targetCount, profile);

            // Score
            const state = this.fitness.recalculate(optimized, targetCount);
            const score = this.fitness.toBreakdown(state);

            if (!best || score.totalScore > best.score.totalScore) {
                best = { ctx: optimized, score, strategy: `${profile.name}-sa` };
            }
        }

        // Strategy 2: Genetic Algorithm approach
        // Use balanced profile for GA
        const balancedProfile = STRATEGIES[0];
        const gaResult = this.ga.optimize(targets, unlockedSlots, balancedProfile, targetCount);

        // Further refine GA result with SA
        const gaOptimized = this.sa.optimize(gaResult, targetCount, balancedProfile);
        const gaState = this.fitness.recalculate(gaOptimized, targetCount);
        const gaScore = this.fitness.toBreakdown(gaState);

        if (!best || gaScore.totalScore > best.score.totalScore) {
            best = { ctx: gaOptimized, score: gaScore, strategy: 'genetic-sa' };
        }

        return best!;
    }

    /**
     * Find if there's a dominant mutation (>= 70% of total)
     */
    private findDominantMutation(
        targets: Array<{ mutationId: string; quantity: number }>,
        totalCount: number
    ): { mutationId: string; quantity: number } | null {
        for (const target of targets) {
            if (target.quantity >= totalCount * 0.7) {
                return target;
            }
        }
        return null;
    }

    /**
     * Add remaining mutations to an existing context
     */
    private addRemainingMutations(
        ctx: PlacementContext,
        targets: Array<{ mutationId: string; quantity: number }>
    ): void {
        for (const { mutationId, quantity } of targets) {
            const mutation = this.parser.parse(mutationId);
            const [w, h] = mutation.size;

            for (let i = 0; i < quantity; i++) {
                // Find best position
                for (let y = 0; y <= 10 - h; y++) {
                    for (let x = 0; x <= 10 - w; x++) {
                        const feasible = this.checker.checkFeasibility(ctx, mutation, x, y);
                        if (feasible) {
                            const instanceId = `${mutationId}_extra_${i}`;
                            this.placer.executePlacement(ctx, mutation, feasible, instanceId);
                            break;
                        }
                    }
                }
            }
        }
    }

    optimizeAll(
        targets: Array<{ mutationId: string; quantity: number }>,
        unlockedSlots: Set<string>
    ): Array<{ ctx: PlacementContext; score: ScoreBreakdown; strategy: string }> {
        const targetCount = targets.reduce((s, t) => s + t.quantity, 0);
        const results: Array<{ ctx: PlacementContext; score: ScoreBreakdown; strategy: string }> = [];

        // Check for bulk optimization opportunity
        const dominantMutation = this.findDominantMutation(targets, targetCount);
        if (dominantMutation) {
            const bulkResult = this.bulk.placeBulk(dominantMutation.mutationId, dominantMutation.quantity, unlockedSlots);
            const otherTargets = targets.filter(t => t.mutationId !== dominantMutation.mutationId);
            if (otherTargets.length > 0) {
                this.addRemainingMutations(bulkResult.ctx, otherTargets);
            }
            const profile = STRATEGIES[0];
            const optimized = this.sa.optimize(bulkResult.ctx, targetCount, profile);
            const state = this.fitness.recalculate(optimized, targetCount);
            const score = this.fitness.toBreakdown(state);
            results.push({ ctx: optimized, score, strategy: 'bulk-pattern-sa' });
        }

        // Run all Greedy + SA strategies
        for (const profile of STRATEGIES) {
            const { ctx } = this.greedy.solve(targets, unlockedSlots, profile);
            const optimized = this.sa.optimize(ctx, targetCount, profile);
            const state = this.fitness.recalculate(optimized, targetCount);
            const score = this.fitness.toBreakdown(state);
            results.push({ ctx: optimized, score, strategy: `${profile.name}-sa` });
        }

        // Add Genetic Algorithm result
        const balancedProfile = STRATEGIES[0];
        const gaResult = this.ga.optimize(targets, unlockedSlots, balancedProfile, targetCount);
        const gaOptimized = this.sa.optimize(gaResult, targetCount, balancedProfile);
        const gaState = this.fitness.recalculate(gaOptimized, targetCount);
        const gaScore = this.fitness.toBreakdown(gaState);
        results.push({ ctx: gaOptimized, score: gaScore, strategy: 'genetic-sa' });

        // Sort by total score descending
        results.sort((a, b) => b.score.totalScore - a.score.totalScore);
        return results;
    }

    getParser(): MutationParser {
        return this.parser;
    }
}

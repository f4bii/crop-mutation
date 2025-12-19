import { MUTATION_TIERS } from '../tierUtils';
import { GRID_SIZE } from './constants';
import { PlacementContext } from './PlacementContext';
import { FeasibilityChecker } from './FeasibilityChecker';
import { PlacementScorer } from './PlacementScorer';
import { Placer } from './Placer';
import type { MutationParser } from './MutationParser';
import type { MutationPlacement, StrategyProfile, FeasiblePlacement } from './types';

export class GreedySolver {
    private parser: MutationParser;
    private checker: FeasibilityChecker;
    private scorer: PlacementScorer;
    private placer: Placer;

    constructor(parser: MutationParser) {
        this.parser = parser;
        this.checker = new FeasibilityChecker();
        this.scorer = new PlacementScorer(parser);
        this.placer = new Placer();
    }

    solve(
        targets: Array<{ mutationId: string; quantity: number }>,
        unlockedSlots: Set<string>,
        profile: StrategyProfile
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];

        // Expand and sort targets
        const instances = this.expandAndSort(targets);

        for (const { mutationId, instanceId } of instances) {
            const mutation = this.parser.parse(mutationId);
            const [w, h] = mutation.size;

            // Find all feasible placements
            const candidates: Array<{ feasible: FeasiblePlacement; score: number }> = [];

            for (let y = 0; y <= GRID_SIZE - h; y++) {
                for (let x = 0; x <= GRID_SIZE - w; x++) {
                    const feasible = this.checker.checkFeasibility(ctx, mutation, x, y);
                    if (feasible) {
                        const score = this.scorer.score(feasible, mutation, ctx, profile);
                        candidates.push({ feasible, score });
                    }
                }
            }

            if (candidates.length === 0) continue;

            // Sort by score
            candidates.sort((a, b) => b.score - a.score);

            // Select candidate (with optional randomization)
            let selected = candidates[0];
            if (profile.randomness > 0 && candidates.length > 1 && Math.random() < profile.randomness) {
                const topN = Math.min(3, candidates.length);
                selected = candidates[Math.floor(Math.random() * topN)];
            }

            // Execute placement
            const placement = this.placer.executePlacement(ctx, mutation, selected.feasible, instanceId);
            placements.push(placement);
        }

        return { ctx, placements };
    }

    private expandAndSort(targets: Array<{ mutationId: string; quantity: number }>): Array<{ mutationId: string; instanceId: string }> {
        const expanded: Array<{ mutationId: string; instanceId: string; priority: number }> = [];

        for (const { mutationId, quantity } of targets) {
            const mutation = this.parser.parse(mutationId);
            const [w, h] = mutation.size;
            const size = w * h;
            const tier = MUTATION_TIERS[mutationId] || 0;
            const isIsolation = mutation.conditions.requiresIsolation;

            // Priority: larger size > higher tier > regular before isolation
            const priority = size * 100 + tier * 10 + (isIsolation ? 0 : 1);

            for (let i = 0; i < quantity; i++) {
                expanded.push({ mutationId, instanceId: `${mutationId}_${i}`, priority });
            }
        }

        // Sort by priority descending
        expanded.sort((a, b) => b.priority - a.priority);

        return expanded.map(({ mutationId, instanceId }) => ({ mutationId, instanceId }));
    }
}

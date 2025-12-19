import { MUTATION_TIERS } from '../tierUtils';
import { GRID_SIZE } from './constants';
import type { MutationParser } from './MutationParser';
import type { PlacementContext } from './PlacementContext';
import type { ParsedMutation, FeasiblePlacement, StrategyProfile } from './types';

export class PlacementScorer {
    private parser: MutationParser;

    constructor(parser: MutationParser) {
        this.parser = parser;
    }

    score(
        feasible: FeasiblePlacement,
        mutation: ParsedMutation,
        ctx: PlacementContext,
        profile: StrategyProfile
    ): number {
        const [w, h] = mutation.size;
        let score = 0;

        const allMutations = ctx.mutations.getAll();

        // Compactness: strongly prefer positions close to existing mutations
        if (allMutations.length > 0) {
            // Calculate centroid of existing placements
            const centerX = allMutations.reduce((s, m) => s + m.position.x + m.size[0] / 2, 0) / allMutations.length;
            const centerY = allMutations.reduce((s, m) => s + m.position.y + m.size[1] / 2, 0) / allMutations.length;

            // Distance from new position center to centroid
            const newCenterX = feasible.position.x + w / 2;
            const newCenterY = feasible.position.y + h / 2;
            const dist = Math.abs(newCenterX - centerX) + Math.abs(newCenterY - centerY);

            // Strong compactness bonus (max 100 points when adjacent)
            score += Math.max(0, 100 - dist * 8) * profile.compactnessWeight;

            // Adjacency bonus: extra points for being directly next to existing mutations
            for (const placed of allMutations) {
                const adjDist = this.adjacencyDistance(feasible.position, w, h, placed.position, placed.size[0], placed.size[1]);
                if (adjDist <= 1) {
                    score += 30 * profile.compactnessWeight; // Bonus for touching
                }
            }
        } else {
            // First mutation: prefer center of grid
            const centerDist = Math.abs(feasible.position.x + w / 2 - GRID_SIZE / 2) +
                              Math.abs(feasible.position.y + h / 2 - GRID_SIZE / 2);
            score += Math.max(0, 50 - centerDist * 5) * profile.compactnessWeight;
        }

        // Sharing bonus: reusing existing crops (reduced weight)
        let sharingBonus = 0;
        for (const positions of feasible.satisfiedCrops.values()) {
            sharingBonus += positions.length;
        }
        score += sharingBonus * profile.sharingWeight * 30;

        // Synergy: spread effects near positive effects (reduced weight)
        if (this.parser.hasSpreadEffect(mutation)) {
            for (const placed of allMutations) {
                const placedMut = this.parser.parse(placed.mutationId);
                if (this.parser.hasPositiveEffect(placedMut)) {
                    const dist = Math.abs(feasible.position.x - placed.position.x) +
                                Math.abs(feasible.position.y - placed.position.y);
                    if (dist <= 3) {
                        score += (4 - dist) * profile.synergyWeight * 5;
                    }
                }
            }
        }

        // Corner bonus for isolation mutations
        if (mutation.conditions.requiresIsolation) {
            const cornerBonus = (feasible.position.x === 0 || feasible.position.x >= GRID_SIZE - w ? 1 : 0) +
                               (feasible.position.y === 0 || feasible.position.y >= GRID_SIZE - h ? 1 : 0);
            score += cornerBonus * profile.cornerWeight * 20;
        }

        // Tier bonus (minor)
        const tier = MUTATION_TIERS[mutation.id] || 0;
        score += tier * 3;

        return score;
    }

    // Calculate minimum distance between two rectangles
    private adjacencyDistance(
        pos1: { x: number; y: number }, w1: number, h1: number,
        pos2: { x: number; y: number }, w2: number, h2: number
    ): number {
        const left1 = pos1.x, right1 = pos1.x + w1;
        const top1 = pos1.y, bottom1 = pos1.y + h1;
        const left2 = pos2.x, right2 = pos2.x + w2;
        const top2 = pos2.y, bottom2 = pos2.y + h2;

        const dx = Math.max(0, Math.max(left1 - right2, left2 - right1));
        const dy = Math.max(0, Math.max(top1 - bottom2, top2 - bottom1));

        return dx + dy;
    }
}

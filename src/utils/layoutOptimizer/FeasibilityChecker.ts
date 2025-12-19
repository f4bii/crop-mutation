import { cellKey } from './utils';
import { GRID_SIZE } from './constants';
import type { PlacementContext } from './PlacementContext';
import type { ParsedMutation, FeasiblePlacement, Position } from './types';

export class FeasibilityChecker {
    // Check if a mutation CAN be placed at position (returns null if not feasible)
    checkFeasibility(
        ctx: PlacementContext,
        mutation: ParsedMutation,
        x: number,
        y: number
    ): FeasiblePlacement | null {
        const [w, h] = mutation.size;

        // Basic grid fit
        if (!ctx.grid.canFitRect(x, y, w, h)) return null;

        // Check for empty zone conflicts
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                if (ctx.emptyZones.has(cellKey(x + dx, y + dy))) return null;
            }
        }

        // Isolation check
        if (mutation.conditions.requiresIsolation) {
            for (let dy = -1; dy <= h; dy++) {
                for (let dx = -1; dx <= w; dx++) {
                    if (dy >= 0 && dy < h && dx >= 0 && dx < w) continue;
                    const ax = x + dx, ay = y + dy;
                    if (ax < 0 || ax >= GRID_SIZE || ay < 0 || ay >= GRID_SIZE) continue;
                    if (ctx.crops.hasCrop(ax, ay)) return null;
                }
            }
            // Isolation mutations don't need crops
            return {
                position: { x, y },
                freeCells: [],
                satisfiedCrops: new Map(),
                satisfiedMutations: new Map(),
                cropsNeeded: new Map(),
            };
        }

        // Find adjacent cells and what's already there
        const freeCells: Position[] = [];
        const satisfiedCrops = new Map<string, Position[]>();
        const satisfiedMutations = new Map<string, Position[]>();
        const checkedMutations = new Set<string>();

        for (let dy = -1; dy <= h; dy++) {
            for (let dx = -1; dx <= w; dx++) {
                if (dy >= 0 && dy < h && dx >= 0 && dx < w) continue;
                const ax = x + dx, ay = y + dy;
                if (ax < 0 || ax >= GRID_SIZE || ay < 0 || ay >= GRID_SIZE) continue;

                // Check for existing crop
                const crop = ctx.crops.getCrop(ax, ay);
                if (crop && mutation.conditions.crops.has(crop.type)) {
                    if (!satisfiedCrops.has(crop.type)) {
                        satisfiedCrops.set(crop.type, []);
                    }
                    satisfiedCrops.get(crop.type)!.push({ x: ax, y: ay });
                    continue;
                }

                // Check for existing mutation
                const mutId = ctx.mutations.getMutationIdAt(ax, ay);
                if (mutId && mutation.conditions.mutations.has(mutId) && !checkedMutations.has(mutId)) {
                    checkedMutations.add(mutId);
                    if (!satisfiedMutations.has(mutId)) {
                        satisfiedMutations.set(mutId, []);
                    }
                    satisfiedMutations.get(mutId)!.push({ x: ax, y: ay });
                    continue;
                }

                // Free cell for new crop
                if (ctx.isCellFreeForCrop(ax, ay)) {
                    freeCells.push({ x: ax, y: ay });
                }
            }
        }

        // Calculate what crops still need to be placed
        const cropsNeeded = new Map<string, number>();
        for (const [cropType, required] of mutation.conditions.crops) {
            const satisfied = satisfiedCrops.get(cropType)?.length || 0;
            const needed = Math.max(0, required - satisfied);
            if (needed > 0) {
                cropsNeeded.set(cropType, needed);
            }
        }

        // Check mutation conditions
        for (const [mutId, required] of mutation.conditions.mutations) {
            const satisfied = satisfiedMutations.get(mutId)?.length || 0;
            if (satisfied < required) {
                return null;  // Can't satisfy mutation requirement
            }
        }

        // Check if we have enough free cells for needed crops
        const totalNeeded = Array.from(cropsNeeded.values()).reduce((a, b) => a + b, 0);
        if (freeCells.length < totalNeeded) return null;

        return {
            position: { x, y },
            freeCells,
            satisfiedCrops,
            satisfiedMutations,
            cropsNeeded,
        };
    }
}

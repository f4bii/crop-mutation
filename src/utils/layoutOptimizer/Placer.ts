import type { PlacementContext } from './PlacementContext';
import type { ParsedMutation, FeasiblePlacement, MutationPlacement } from './types';

export class Placer {
    executePlacement(
        ctx: PlacementContext,
        mutation: ParsedMutation,
        feasible: FeasiblePlacement,
        instanceId: string
    ): MutationPlacement {
        const [w, h] = mutation.size;
        const { x, y } = feasible.position;

        // Occupy grid
        ctx.grid.occupyRect(x, y, w, h);

        const placedCrops: Array<{ position: { x: number; y: number }; cropType: string }> = [];

        if (mutation.conditions.requiresIsolation) {
            // Mark empty zones around isolation mutation
            for (let dy = -1; dy <= h; dy++) {
                for (let dx = -1; dx <= w; dx++) {
                    if (dy >= 0 && dy < h && dx >= 0 && dx < w) continue;
                    ctx.markEmptyZone(x + dx, y + dy);
                }
            }
        } else {
            // Register existing crops as serving this mutation
            for (const [cropType, positions] of feasible.satisfiedCrops) {
                const required = mutation.conditions.crops.get(cropType) || 0;
                for (const pos of positions.slice(0, required)) {
                    const crop = ctx.crops.getCrop(pos.x, pos.y);
                    if (crop) {
                        crop.mutations.add(instanceId);
                        placedCrops.push({ position: pos, cropType });
                    }
                }
            }

            // Place new crops
            let cellIdx = 0;
            for (const [cropType, needed] of feasible.cropsNeeded) {
                for (let i = 0; i < needed && cellIdx < feasible.freeCells.length; i++) {
                    const cell = feasible.freeCells[cellIdx++];
                    ctx.crops.placeCrop(cell.x, cell.y, cropType, instanceId);
                    ctx.grid.occupy(cell.x, cell.y);
                    placedCrops.push({ position: cell, cropType });
                }
            }
        }

        const placement: MutationPlacement = {
            mutationId: mutation.id,
            instanceId,
            position: feasible.position,
            size: mutation.size,
            crops: placedCrops,
            needsIsolation: mutation.conditions.requiresIsolation,
        };

        ctx.mutations.place(placement);
        return placement;
    }

    removePlacement(ctx: PlacementContext, instanceId: string): MutationPlacement | null {
        const placement = ctx.mutations.remove(instanceId);
        if (!placement) return null;

        const [w, h] = placement.size;
        ctx.grid.releaseRect(placement.position.x, placement.position.y, w, h);

        // Release crops and their grid cells
        const releasedCells = ctx.crops.removeMutationFromCrops(instanceId);
        for (const cell of releasedCells) {
            ctx.grid.release(cell.x, cell.y);
        }

        // Note: empty zones are not released (they persist for other isolation mutations)

        return placement;
    }
}

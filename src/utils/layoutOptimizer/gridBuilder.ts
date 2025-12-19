import { cellKey, parseKey } from './utils';
import { GRID_SIZE } from './constants';
import type { MutationParser } from './MutationParser';
import type { PlacementContext } from './PlacementContext';
import type { Grid as GridType, PlacedMutation } from '@types';

export const buildGrid = (
    ctx: PlacementContext,
    parser: MutationParser,
    unlockedSlots: Set<string>
): { grid: GridType; mutations: PlacedMutation[] } => {
    const grid: GridType = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    const mutations: PlacedMutation[] = [];

    const allPlacements = ctx.mutations.getAll();

    for (const placement of allPlacements) {
        const mutation = parser.parse(placement.mutationId);
        const [w, h] = mutation.size;

        // Place mutation cells
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                const isCenter = dx === Math.floor(w / 2) && dy === Math.floor(h / 2);
                grid[placement.position.y + dy][placement.position.x + dx] = {
                    type: 'mutation_area',
                    mutationId: placement.mutationId,
                    isCenter,
                    needsIsolation: placement.needsIsolation,
                };
            }
        }

        // Place empty zones for isolation
        if (placement.needsIsolation) {
            for (let dy = -1; dy <= h; dy++) {
                for (let dx = -1; dx <= w; dx++) {
                    if (dy >= 0 && dy < h && dx >= 0 && dx < w) continue;
                    const ax = placement.position.x + dx;
                    const ay = placement.position.y + dy;
                    if (ax >= 0 && ax < GRID_SIZE && ay >= 0 && ay < GRID_SIZE) {
                        if (!grid[ay][ax] && unlockedSlots.has(cellKey(ax, ay))) {
                            grid[ay][ax] = { type: 'empty_zone', forMutation: placement.mutationId };
                        }
                    }
                }
            }
        }

        // Build PlacedMutation
        const sharedCrops: string[] = [];
        for (const crop of placement.crops) {
            const cropInfo = ctx.crops.getCrop(crop.position.x, crop.position.y);
            if (cropInfo && cropInfo.mutations.size > 1) {
                sharedCrops.push(cellKey(crop.position.x, crop.position.y));
            }
        }

        mutations.push({
            id: placement.mutationId,
            name: mutation.name,
            position: {
                x: placement.position.x,
                y: placement.position.y,
                adjacentCells: placement.crops.map(c => c.position),
            },
            size: `${w}x${h}`,
            conditions: Object.fromEntries([
                ...Array.from(mutation.conditions.crops.entries()),
                ...Array.from(mutation.conditions.mutations.entries()),
                ...(mutation.conditions.requiresIsolation ? [['adjacent_crops', 0]] : []),
            ]),
            needsIsolation: placement.needsIsolation,
            sharedCrops,
        });
    }

    // Add crops to grid
    for (const [key, cropInfo] of ctx.crops.getAllCrops()) {
        const pos = parseKey(key);
        if (!grid[pos.y][pos.x]) {
            const mutArray = Array.from(cropInfo.mutations);
            grid[pos.y][pos.x] = {
                type: 'crop',
                crop: cropInfo.type,
                forMutation: mutArray[0],
                forMutations: mutArray.length > 1 ? mutArray : undefined,
            };
        }
    }

    return { grid, mutations };
};

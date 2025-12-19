import { GRID_SIZE } from './constants';
import { PlacementContext } from './PlacementContext';
import { FeasibilityChecker } from './FeasibilityChecker';
import { Placer } from './Placer';
import type { MutationParser } from './MutationParser';
import type { ParsedMutation, MutationPlacement } from './types';

export class BulkPlacer {
    private parser: MutationParser;
    private checker: FeasibilityChecker;
    private placer: Placer;

    constructor(parser: MutationParser) {
        this.parser = parser;
        this.checker = new FeasibilityChecker();
        this.placer = new Placer();
    }

    /**
     * Optimized placement for bulk same-mutation requests.
     * Returns the context with maximum mutations placed.
     */
    placeBulk(
        mutationId: string,
        quantity: number,
        unlockedSlots: Set<string>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const mutation = this.parser.parse(mutationId);

        // Skip bulk optimization for isolation mutations or large mutations
        if (mutation.conditions.requiresIsolation || mutation.size[0] > 1 || mutation.size[1] > 1) {
            return this.fallbackPlacement(mutation, quantity, unlockedSlots);
        }

        // Get required crops
        const cropTypes = Array.from(mutation.conditions.crops.entries());
        if (cropTypes.length === 0) {
            return this.fallbackPlacement(mutation, quantity, unlockedSlots);
        }

        // Try multiple crop patterns and pick the best
        const patterns = [
            () => this.optimalTwoCropPattern(mutation, quantity, unlockedSlots, cropTypes),
            () => this.maxDensityPattern(mutation, quantity, unlockedSlots, cropTypes),
            () => this.sparseGridPattern(mutation, quantity, unlockedSlots, cropTypes),
            () => this.alternatingRowPattern(mutation, quantity, unlockedSlots, cropTypes),
            () => this.diagonalPattern(mutation, quantity, unlockedSlots, cropTypes),
            () => this.stripedPattern(mutation, quantity, unlockedSlots, cropTypes),
            () => this.denseGridPattern(mutation, quantity, unlockedSlots, cropTypes),
            () => this.checkerboardPattern(mutation, quantity, unlockedSlots, cropTypes),
        ];

        let bestResult: { ctx: PlacementContext; placements: MutationPlacement[] } | null = null;

        for (const pattern of patterns) {
            const result = pattern();
            if (!bestResult || result.placements.length > bestResult.placements.length) {
                bestResult = result;
            }
            // Early exit if we placed all requested
            if (bestResult.placements.length >= quantity) break;
        }

        return bestResult!;
    }

    /**
     * Alternating row pattern - optimized for 2-crop mutations like Gloomgourd
     * Places crops on every other row with alternating types
     */
    private alternatingRowPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];

        if (cropTypes.length === 2) {
            const [crop1] = cropTypes[0];
            const [crop2] = cropTypes[1];

            // Pattern: place crops on rows 0, 3, 6, 9 with alternating types
            // This allows 2 mutation rows between each crop row
            for (let y = 0; y < GRID_SIZE; y += 3) {
                for (let x = 0; x < GRID_SIZE; x++) {
                    if (!ctx.grid.isFree(x, y)) continue;
                    // Alternate crops, shift pattern each row
                    const cropType = ((x + Math.floor(y / 3)) % 2 === 0) ? crop1 : crop2;
                    ctx.crops.placeCrop(x, y, cropType, '__pre__');
                    ctx.grid.occupy(x, y);
                }
            }
        } else {
            return this.stripedPattern(mutation, quantity, unlockedSlots, cropTypes);
        }

        this.fillMutations(ctx, mutation, quantity, placements);
        return { ctx, placements };
    }

    /**
     * Sparse grid pattern - places crops in a sparse grid for maximum mutation density
     * Each crop can be shared by up to 8 adjacent mutations
     */
    private sparseGridPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];

        if (cropTypes.length === 2) {
            const [crop1] = cropTypes[0];
            const [crop2] = cropTypes[1];

            // Place crop pairs at regular intervals
            // Each pair (P at x,y and M at x+1,y) serves mutations around them
            for (let y = 1; y < GRID_SIZE; y += 3) {
                for (let x = 0; x < GRID_SIZE - 1; x += 3) {
                    if (ctx.grid.isFree(x, y)) {
                        ctx.crops.placeCrop(x, y, crop1, '__pre__');
                        ctx.grid.occupy(x, y);
                    }
                    if (ctx.grid.isFree(x + 1, y)) {
                        ctx.crops.placeCrop(x + 1, y, crop2, '__pre__');
                        ctx.grid.occupy(x + 1, y);
                    }
                }
            }
        }

        this.fillMutations(ctx, mutation, quantity, placements);
        return { ctx, placements };
    }

    /**
     * Maximum density pattern - specifically optimized for 1+1 crop requirements
     * Places crop pairs sparsely to maximize mutation space while ensuring coverage
     * Target: ~30 crops serving ~70 mutations
     */
    private maxDensityPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];

        if (cropTypes.length === 2) {
            const [crop1] = cropTypes[0];
            const [crop2] = cropTypes[1];

            // Place crop pairs in a pattern that maximizes coverage
            // Pattern: PM pairs at intervals, with pairs serving surrounding mutations
            // Rows 1, 4, 7: place crop pairs
            for (let y = 1; y < GRID_SIZE; y += 3) {
                for (let x = 1; x < GRID_SIZE - 1; x += 3) {
                    if (ctx.grid.isFree(x, y)) {
                        ctx.crops.placeCrop(x, y, crop1, '__pre__');
                        ctx.grid.occupy(x, y);
                    }
                    if (ctx.grid.isFree(x + 1, y)) {
                        ctx.crops.placeCrop(x + 1, y, crop2, '__pre__');
                        ctx.grid.occupy(x + 1, y);
                    }
                }
            }
        }

        this.fillMutations(ctx, mutation, quantity, placements);
        return { ctx, placements };
    }

    /**
     * Optimal grid pattern for 2-crop mutations
     * Creates a grid where P and M alternate, leaving maximum space for mutations
     */
    private optimalTwoCropPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];

        if (cropTypes.length === 2) {
            const [crop1] = cropTypes[0];
            const [crop2] = cropTypes[1];

            // Place crops in rows 1, 4, 7 at specific positions for max coverage
            const cropRows = [1, 4, 7];
            const cropCols = [1, 4, 7];

            for (const y of cropRows) {
                if (y >= GRID_SIZE) continue;
                for (let i = 0; i < cropCols.length; i++) {
                    const x = cropCols[i];
                    if (x >= GRID_SIZE) continue;

                    // Place alternating crop pair
                    if (ctx.grid.isFree(x, y)) {
                        ctx.crops.placeCrop(x, y, crop1, '__pre__');
                        ctx.grid.occupy(x, y);
                    }
                    if (x + 1 < GRID_SIZE && ctx.grid.isFree(x + 1, y)) {
                        ctx.crops.placeCrop(x + 1, y, crop2, '__pre__');
                        ctx.grid.occupy(x + 1, y);
                    }
                }
            }

            // Add edge crops to cover corners
            // Top edge
            if (ctx.grid.isFree(0, 0)) {
                ctx.crops.placeCrop(0, 0, crop1, '__pre__');
                ctx.grid.occupy(0, 0);
            }
            if (ctx.grid.isFree(1, 0)) {
                ctx.crops.placeCrop(1, 0, crop2, '__pre__');
                ctx.grid.occupy(1, 0);
            }
            if (ctx.grid.isFree(GRID_SIZE - 2, 0)) {
                ctx.crops.placeCrop(GRID_SIZE - 2, 0, crop1, '__pre__');
                ctx.grid.occupy(GRID_SIZE - 2, 0);
            }
            if (ctx.grid.isFree(GRID_SIZE - 1, 0)) {
                ctx.crops.placeCrop(GRID_SIZE - 1, 0, crop2, '__pre__');
                ctx.grid.occupy(GRID_SIZE - 1, 0);
            }
        }

        this.fillMutations(ctx, mutation, quantity, placements);
        return { ctx, placements };
    }

    /**
     * Dense grid pattern - maximizes sharing by placing crops at intersections
     * Works well for mutations needing multiple crop types
     */
    private denseGridPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];
        const totalCropsNeeded = cropTypes.reduce((sum, [, n]) => sum + n, 0);

        // Place crops in a grid pattern where each mutation spot
        // has access to all required crop types
        // Pattern spacing based on crops needed
        const spacing = Math.ceil(Math.sqrt(totalCropsNeeded + 1));

        for (let y = 0; y < GRID_SIZE; y += spacing) {
            for (let x = 0; x < GRID_SIZE; x++) {
                if (!ctx.grid.isFree(x, y)) continue;

                // Place different crop types in sequence
                const cropIdx = Math.floor(x / spacing) % cropTypes.length;
                if (cropIdx < cropTypes.length) {
                    const [cropType] = cropTypes[cropIdx % cropTypes.length];
                    ctx.crops.placeCrop(x, y, cropType, '__pre__');
                    ctx.grid.occupy(x, y);
                }
            }
        }

        // Also place crops vertically
        for (let x = 0; x < GRID_SIZE; x += spacing) {
            for (let y = 0; y < GRID_SIZE; y++) {
                if (!ctx.grid.isFree(x, y)) continue;

                const cropIdx = (Math.floor(y / spacing) + 1) % cropTypes.length;
                if (cropIdx < cropTypes.length) {
                    const [cropType] = cropTypes[cropIdx];
                    ctx.crops.placeCrop(x, y, cropType, '__pre__');
                    ctx.grid.occupy(x, y);
                }
            }
        }

        // Fill mutations
        this.fillMutations(ctx, mutation, quantity, placements);

        return { ctx, placements };
    }

    /**
     * Diagonal stripe pattern - crops on diagonals, mutations between
     */
    private diagonalPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];
        const totalCropsNeeded = cropTypes.reduce((sum, [, n]) => sum + n, 0);

        // Calculate diagonal spacing based on crops needed
        const spacing = totalCropsNeeded + 1;

        // First pass: place crops in diagonal stripes
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const diagonalIdx = (x + y) % spacing;
                if (diagonalIdx < totalCropsNeeded && ctx.grid.isFree(x, y)) {
                    // Determine which crop type this position gets
                    let cropIdx = diagonalIdx;
                    for (const [cropType, needed] of cropTypes) {
                        if (cropIdx < needed) {
                            ctx.crops.placeCrop(x, y, cropType, '__pre__');
                            ctx.grid.occupy(x, y);
                            break;
                        }
                        cropIdx -= needed;
                    }
                }
            }
        }

        // Second pass: place mutations in remaining spaces
        this.fillMutations(ctx, mutation, quantity, placements);

        return { ctx, placements };
    }

    /**
     * Horizontal striped pattern
     */
    private stripedPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];
        const totalCropsNeeded = cropTypes.reduce((sum, [, n]) => sum + n, 0);

        // Place crops in horizontal stripes every N rows
        const spacing = totalCropsNeeded + 1;

        for (let y = 0; y < GRID_SIZE; y++) {
            const isCropRow = y % spacing < totalCropsNeeded;
            if (isCropRow) {
                const rowCropIdx = y % spacing;
                // Find which crop type this row should have
                let idx = rowCropIdx;
                let selectedCrop = cropTypes[0][0];
                for (const [cropType, needed] of cropTypes) {
                    if (idx < needed) {
                        selectedCrop = cropType;
                        break;
                    }
                    idx -= needed;
                }

                for (let x = 0; x < GRID_SIZE; x++) {
                    if (ctx.grid.isFree(x, y)) {
                        ctx.crops.placeCrop(x, y, selectedCrop, '__pre__');
                        ctx.grid.occupy(x, y);
                    }
                }
            }
        }

        // Fill mutations
        this.fillMutations(ctx, mutation, quantity, placements);

        return { ctx, placements };
    }

    /**
     * Checkerboard pattern - alternating crops
     */
    private checkerboardPattern(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>,
        cropTypes: Array<[string, number]>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];

        // For 2 crop types, use true checkerboard
        // For more, use extended pattern
        const totalTypes = cropTypes.length;

        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                const patternIdx = (x + y) % (totalTypes + 1);
                if (patternIdx < totalTypes && ctx.grid.isFree(x, y)) {
                    const [cropType] = cropTypes[patternIdx];
                    ctx.crops.placeCrop(x, y, cropType, '__pre__');
                    ctx.grid.occupy(x, y);
                }
            }
        }

        // Fill mutations
        this.fillMutations(ctx, mutation, quantity, placements);

        return { ctx, placements };
    }

    /**
     * Fill remaining grid spaces with mutations, using pre-placed crops
     */
    private fillMutations(
        ctx: PlacementContext,
        mutation: ParsedMutation,
        maxQuantity: number,
        placements: MutationPlacement[]
    ): void {
        const [w, h] = mutation.size;
        let placed = 0;

        // Score each position by how many pre-placed crops it can use
        const candidates: Array<{ x: number; y: number; score: number }> = [];

        for (let y = 0; y <= GRID_SIZE - h; y++) {
            for (let x = 0; x <= GRID_SIZE - w; x++) {
                if (!ctx.grid.canFitRect(x, y, w, h)) continue;

                // Count adjacent crops that match requirements
                let score = 0;
                const satisfiedCrops = new Map<string, number>();

                for (let dy = -1; dy <= h; dy++) {
                    for (let dx = -1; dx <= w; dx++) {
                        if (dy >= 0 && dy < h && dx >= 0 && dx < w) continue;
                        const ax = x + dx, ay = y + dy;
                        if (ax < 0 || ax >= GRID_SIZE || ay < 0 || ay >= GRID_SIZE) continue;

                        const crop = ctx.crops.getCrop(ax, ay);
                        if (crop && mutation.conditions.crops.has(crop.type)) {
                            const current = satisfiedCrops.get(crop.type) || 0;
                            const needed = mutation.conditions.crops.get(crop.type) || 0;
                            if (current < needed) {
                                satisfiedCrops.set(crop.type, current + 1);
                                score += 10; // Bonus for reusing existing crop
                            }
                        }
                    }
                }

                // Check if all crop requirements are satisfied
                let allSatisfied = true;
                for (const [cropType, needed] of mutation.conditions.crops) {
                    if ((satisfiedCrops.get(cropType) || 0) < needed) {
                        allSatisfied = false;
                        break;
                    }
                }

                if (allSatisfied) {
                    candidates.push({ x, y, score });
                }
            }
        }

        // Sort by score descending (prefer positions using more existing crops)
        candidates.sort((a, b) => b.score - a.score);

        // Place mutations
        for (const { x, y } of candidates) {
            if (placed >= maxQuantity) break;

            const feasible = this.checker.checkFeasibility(ctx, mutation, x, y);
            if (feasible) {
                const instanceId = `${mutation.id}_${placed}`;
                const placement = this.placer.executePlacement(ctx, mutation, feasible, instanceId);
                placements.push(placement);
                placed++;
            }
        }
    }

    /**
     * Fallback to simple sequential placement
     */
    private fallbackPlacement(
        mutation: ParsedMutation,
        quantity: number,
        unlockedSlots: Set<string>
    ): { ctx: PlacementContext; placements: MutationPlacement[] } {
        const ctx = new PlacementContext(unlockedSlots);
        const placements: MutationPlacement[] = [];
        const [w, h] = mutation.size;

        for (let i = 0; i < quantity; i++) {
            let placed = false;
            for (let y = 0; y <= GRID_SIZE - h && !placed; y++) {
                for (let x = 0; x <= GRID_SIZE - w && !placed; x++) {
                    const feasible = this.checker.checkFeasibility(ctx, mutation, x, y);
                    if (feasible) {
                        const instanceId = `${mutation.id}_${i}`;
                        const placement = this.placer.executePlacement(ctx, mutation, feasible, instanceId);
                        placements.push(placement);
                        placed = true;
                    }
                }
            }
        }

        return { ctx, placements };
    }
}

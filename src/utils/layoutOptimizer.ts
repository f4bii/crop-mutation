import { MUTATION_TIERS } from './tierUtils';
import { getMutationData as getPersistentMutationData } from "@data/mutationsData.ts";
import { calculateGodseedHelpers } from './mutationUtils';
import {
    TargetMutations, OptimizedLayout, Grid, PlacedMutation, MutationData, AvailableMutations
} from '@types';

// ============================================================================
// TYPES
// ============================================================================

interface Position { x: number; y: number; }

interface InfluenceCell {
    positiveInfluence: number;
    negativeInfluence: number;
    spreadBonus: number;
    cropSharingPotential: number;
}

interface Chromosome {
    placements: MutationPlacement[];
    fitness: number;
}

interface MutationPlacement {
    mutationId: string;
    position: Position;
    crops: CropPlacement[];
}

interface CropPlacement {
    position: Position;
    cropType: string;
    sharedWith: string[]; // mutation IDs this crop serves
}

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_SIZE = 10;
const POPULATION_SIZE = 20;
const GENERATIONS = 30;
const MUTATION_RATE = 0.15;
const ELITE_COUNT = 3;
const TOURNAMENT_SIZE = 3;

const NEGATIVE_EFFECTS = ['xp_loss', 'harvest_loss', 'water_drain'];
const SPREAD_EFFECTS = ['effect_spread', 'improved_effect_spread'];

// Fitness weights
const WEIGHTS = {
    placedMutation: 2500,
    cropSharing: 15,
    spatialInfluence: 8,
    compactness: 3,
    effectSpreadBonus: 20,
    isolationPenalty: -50,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

const getMutationData = (id: string, unlockedMutations: AvailableMutations): MutationData => {
    if (id === 'godseed') {
        const helpers = calculateGodseedHelpers(Object.keys(unlockedMutations));
        return {
            name: "Godseed",
            size: "3x3",
            ground: "farmland",
            drops: null,
            effects: [
                "improved_harvest_boost", "improved_water_retain", "improved_xp_boost",
                "immunity", "bonus_drops", "improved_effect_spread"
            ],
            conditions: helpers,
        };
    }
    return getPersistentMutationData(id);
};

const parseSize = (size: string): [number, number] => {
    const [w, h] = size.split('x').map(Number);
    return [w, h];
};

const cellKey = (x: number, y: number): string => `${x},${y}`;

const parseKey = (key: string): Position => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
};

const hasNegativeEffects = (mutation: MutationData): boolean => {
    return mutation.effects.some(e => NEGATIVE_EFFECTS.includes(e));
};

const hasSpreadEffect = (mutation: MutationData): boolean => {
    return mutation.effects.some(e => SPREAD_EFFECTS.includes(e));
};

const hasOnlyPositiveEffects = (mutation: MutationData): boolean => {
    return mutation.effects.length > 0 && !hasNegativeEffects(mutation);
};

// ============================================================================
// SPATIAL INFLUENCE MAP
// ============================================================================

class SpatialInfluenceMap {
    private readonly grid: InfluenceCell[][];
    private readonly unlockedMutations: AvailableMutations;

    constructor(unlockedMutations: AvailableMutations) {
        this.unlockedMutations = unlockedMutations;
        this.grid = Array(GRID_SIZE).fill(null).map(() =>
            Array(GRID_SIZE).fill(null).map(() => ({
                positiveInfluence: 0,
                negativeInfluence: 0,
                spreadBonus: 0,
                cropSharingPotential: 0,
            }))
        );
    }

    // Update influence map based on placed mutations
    updateFromPlacements(placements: MutationPlacement[]): void {
        // Reset
        for (let y = 0; y < GRID_SIZE; y++) {
            for (let x = 0; x < GRID_SIZE; x++) {
                this.grid[y][x] = {
                    positiveInfluence: 0,
                    negativeInfluence: 0,
                    spreadBonus: 0,
                    cropSharingPotential: 0,
                };
            }
        }

        // Calculate influence from each placed mutation
        for (const placement of placements) {
            const mutation = getMutationData(placement.mutationId, this.unlockedMutations);
            const [mw, mh] = parseSize(mutation.size);
            const centerX = placement.position.x + Math.floor(mw / 2);
            const centerY = placement.position.y + Math.floor(mh / 2);

            const hasPositive = hasOnlyPositiveEffects(mutation);
            const hasNegative = hasNegativeEffects(mutation);
            const hasSpread = hasSpreadEffect(mutation);

            // Spread influence to surrounding cells (radius based on effect_spread)
            const radius = hasSpread ? 3 : 1;
            for (let dy = -radius; dy <= radius + mh - 1; dy++) {
                for (let dx = -radius; dx <= radius + mw - 1; dx++) {
                    const nx = placement.position.x + dx;
                    const ny = placement.position.y + dy;
                    if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;

                    const distance = Math.max(
                        Math.abs(nx - centerX) - Math.floor(mw / 2),
                        Math.abs(ny - centerY) - Math.floor(mh / 2)
                    );
                    const falloff = Math.max(0, 1 - distance * 0.25);

                    if (hasPositive) {
                        this.grid[ny][nx].positiveInfluence += falloff * 10;
                    }
                    if (hasNegative) {
                        this.grid[ny][nx].negativeInfluence += falloff * 5;
                    }
                    if (hasSpread) {
                        this.grid[ny][nx].spreadBonus += falloff * 15;
                    }
                }
            }

            // Track crop sharing potential around each crop
            for (const crop of placement.crops) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = crop.position.x + dx;
                        const ny = crop.position.y + dy;
                        if (nx < 0 || nx >= GRID_SIZE || ny < 0 || ny >= GRID_SIZE) continue;
                        this.grid[ny][nx].cropSharingPotential += 2;
                    }
                }
            }
        }
    }

    getInfluence(x: number, y: number): InfluenceCell {
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) {
            return { positiveInfluence: 0, negativeInfluence: 0, spreadBonus: 0, cropSharingPotential: 0 };
        }
        return this.grid[y][x];
    }

    // Score a potential placement position
    scorePlacement(x: number, y: number, mutation: MutationData): number {
        const [mw, mh] = parseSize(mutation.size);
        let score = 0;

        for (let dy = 0; dy < mh; dy++) {
            for (let dx = 0; dx < mw; dx++) {
                const influence = this.getInfluence(x + dx, y + dy);
                score += influence.positiveInfluence;
                score -= influence.negativeInfluence * 0.5;
                if (hasSpreadEffect(mutation)) {
                    score += influence.positiveInfluence * 0.5; // Bonus for spread mutations near positive effects
                }
                score += influence.cropSharingPotential * 0.3;
            }
        }

        return score;
    }
}

// ============================================================================
// LAYOUT STATE MANAGER
// ============================================================================

class LayoutState {
    private usedCells: Set<string> = new Set();
    private cropCells: Map<string, string> = new Map(); // position -> crop type
    private mutationCenters: Map<string, string> = new Map(); // position -> mutation id
    private cropUsage: Map<string, string[]> = new Map(); // position -> mutation ids using this crop
    private readonly unlockedSlots: Set<string>;

    constructor(unlockedSlots: Set<string>) {
        this.unlockedSlots = new Set(unlockedSlots);
    }

    isCellAvailable(x: number, y: number): boolean {
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
        const key = cellKey(x, y);
        return this.unlockedSlots.has(key) && !this.usedCells.has(key) && !this.cropCells.has(key);
    }

    canPlaceMutation(x: number, y: number, mw: number, mh: number): boolean {
        for (let dy = 0; dy < mh; dy++) {
            for (let dx = 0; dx < mw; dx++) {
                if (!this.isCellAvailable(x + dx, y + dy)) return false;
            }
        }
        return true;
    }

    hasCropAdjacent(x: number, y: number, mw: number, mh: number): boolean {
        for (let dy = -1; dy <= mh; dy++) {
            for (let dx = -1; dx <= mw; dx++) {
                if (dy >= 0 && dy < mh && dx >= 0 && dx < mw) continue;
                const ax = x + dx;
                const ay = y + dy;
                if (ax >= 0 && ax < GRID_SIZE && ay >= 0 && ay < GRID_SIZE) {
                    if (this.cropCells.has(cellKey(ax, ay))) return true;
                }
            }
        }
        return false;
    }

    getAdjacentInfo(x: number, y: number, mw: number, mh: number, conditions: Record<string, number | string | undefined>): {
        availableCells: Position[];
        adjacentMutations: Map<string, string>;
        adjacentExistingCrops: Map<string, string>;
        conditionsSatisfiedByMutations: Map<string, number>;
        conditionsSatisfiedByCrops: Map<string, number>;
    } {
        const availableCells: Position[] = [];
        const adjacentMutations = new Map<string, string>();
        const adjacentExistingCrops = new Map<string, string>();
        const conditionsSatisfiedByMutations = new Map<string, number>();
        const conditionsSatisfiedByCrops = new Map<string, number>();

        for (let dy = -1; dy <= mh; dy++) {
            for (let dx = -1; dx <= mw; dx++) {
                if (dy >= 0 && dy < mh && dx >= 0 && dx < mw) continue;
                const ax = x + dx;
                const ay = y + dy;
                const key = cellKey(ax, ay);

                const mutationId = this.mutationCenters.get(key);
                if (mutationId !== undefined) {
                    adjacentMutations.set(key, mutationId);
                    if (conditions[mutationId] !== undefined) {
                        conditionsSatisfiedByMutations.set(
                            mutationId,
                            (conditionsSatisfiedByMutations.get(mutationId) || 0) + 1
                        );
                    }
                } else if (this.cropCells.has(key)) {
                    const cropType = this.cropCells.get(key)!;
                    adjacentExistingCrops.set(key, cropType);
                    if (conditions[cropType] !== undefined) {
                        conditionsSatisfiedByCrops.set(
                            cropType,
                            (conditionsSatisfiedByCrops.get(cropType) || 0) + 1
                        );
                    }
                } else if (this.isCellAvailable(ax, ay)) {
                    availableCells.push({ x: ax, y: ay });
                }
            }
        }

        return { availableCells, adjacentMutations, adjacentExistingCrops, conditionsSatisfiedByMutations, conditionsSatisfiedByCrops };
    }

    placeMutation(x: number, y: number, mutationId: string, mw: number, mh: number): void {
        for (let dy = 0; dy < mh; dy++) {
            for (let dx = 0; dx < mw; dx++) {
                const key = cellKey(x + dx, y + dy);
                this.usedCells.add(key);
                if (dx === Math.floor(mw / 2) && dy === Math.floor(mh / 2)) {
                    this.mutationCenters.set(key, mutationId);
                }
            }
        }
    }

    placeCrop(x: number, y: number, cropType: string, forMutation: string): void {
        const key = cellKey(x, y);
        this.cropCells.set(key, cropType);
        if (!this.cropUsage.has(key)) {
            this.cropUsage.set(key, []);
        }
        this.cropUsage.get(key)!.push(forMutation);
    }

    markEmptyZone(x: number, y: number): void {
        this.usedCells.add(cellKey(x, y));
    }

    registerSharedCrop(key: string, forMutation: string): void {
        if (!this.cropUsage.has(key)) {
            this.cropUsage.set(key, []);
        }
        this.cropUsage.get(key)!.push(forMutation);
    }

    getCropUsage(key: string): string[] {
        return this.cropUsage.get(key) || [];
    }
}

// ============================================================================
// GENETIC ALGORITHM
// ============================================================================

class GeneticOptimizer {
    private readonly unlockedMutations: AvailableMutations;
    private readonly unlockedSlots: Set<string>;
    private influenceMap: SpatialInfluenceMap;
    private readonly isolationTargets: string[];
    private readonly regularTargets: string[];

    constructor(
        unlockedMutations: AvailableMutations,
        targets: string[],
        unlockedSlots: Set<string>
    ) {
        this.unlockedMutations = unlockedMutations;
        this.unlockedSlots = unlockedSlots;
        this.influenceMap = new SpatialInfluenceMap(unlockedMutations);

        // Separate and sort targets
        this.isolationTargets = targets.filter(id => {
            const mutation = getMutationData(id, unlockedMutations);
            return mutation.conditions.adjacent_crops === 0;
        });

        this.regularTargets = targets.filter(id => {
            const mutation = getMutationData(id, unlockedMutations);
            return mutation.conditions.adjacent_crops !== 0;
        }).sort((a, b) => {
            const tierA = MUTATION_TIERS[a] || 0;
            const tierB = MUTATION_TIERS[b] || 0;
            if (tierA !== tierB) return tierA - tierB;
            if (a !== b) return a.localeCompare(b);
            const sizeA = parseSize(getMutationData(a, unlockedMutations).size);
            const sizeB = parseSize(getMutationData(b, unlockedMutations).size);
            return (sizeB[0] * sizeB[1]) - (sizeA[0] * sizeA[1]);
        });
    }

    // Generate initial population
    private generateInitialPopulation(): Chromosome[] {
        const population: Chromosome[] = [];

        // First chromosome: greedy with influence heuristic
        population.push(this.createGreedyChromosome(false));

        // Second: greedy with more randomization
        population.push(this.createGreedyChromosome(true));

        // Fill rest with variations
        while (population.length < POPULATION_SIZE) {
            const variant = this.createGreedyChromosome(true);
            if (Math.random() < 0.3) {
                this.mutateChromosome(variant);
            }
            population.push(variant);
        }

        return population;
    }

    // Create a chromosome using greedy placement with influence scoring
    private createGreedyChromosome(randomize: boolean): Chromosome {
        const state = new LayoutState(this.unlockedSlots);
        const placements: MutationPlacement[] = [];

        // Place regular mutations first
        for (const mutationId of this.regularTargets) {
            const placement = this.findBestPlacement(mutationId, state, randomize);
            if (placement) {
                placements.push(placement);
                this.influenceMap.updateFromPlacements(placements);
            }
        }

        // Place isolation mutations
        for (const mutationId of this.isolationTargets) {
            const placement = this.findIsolationPlacement(mutationId, state, randomize);
            if (placement) {
                placements.push(placement);
            }
        }

        const fitness = this.calculateFitness(placements);
        return { placements, fitness };
    }

    // Find best placement for a regular mutation
    private findBestPlacement(
        mutationId: string,
        state: LayoutState,
        randomize: boolean
    ): MutationPlacement | null {
        const mutation = getMutationData(mutationId, this.unlockedMutations);
        const [mw, mh] = parseSize(mutation.size);
        const conditions = mutation.conditions;

        interface Candidate {
            x: number;
            y: number;
            score: number;
            adjacentInfo: ReturnType<LayoutState['getAdjacentInfo']>;
        }

        const candidates: Candidate[] = [];

        for (let y = 0; y <= GRID_SIZE - mh; y++) {
            for (let x = 0; x <= GRID_SIZE - mw; x++) {
                if (!state.canPlaceMutation(x, y, mw, mh)) continue;

                const adjacentInfo = state.getAdjacentInfo(x, y, mw, mh, conditions);

                // Calculate remaining conditions needed
                let remainingConditions = 0;
                Object.entries(conditions)
                    .filter(([k]) => k !== 'adjacent_crops' && k !== 'special')
                    .forEach(([crop, count]) => {
                        const satisfiedByMutations = adjacentInfo.conditionsSatisfiedByMutations.get(crop) || 0;
                        const satisfiedByCrops = adjacentInfo.conditionsSatisfiedByCrops.get(crop) || 0;
                        const countValue = typeof count === 'number' ? count : 0;
                        remainingConditions += Math.max(0, countValue - satisfiedByMutations - satisfiedByCrops);
                    });

                if (adjacentInfo.availableCells.length < remainingConditions) continue;

                // Score this position
                let score = 0;

                // Spatial influence
                score += this.influenceMap.scorePlacement(x, y, mutation);

                // Crop sharing bonus
                score += adjacentInfo.adjacentExistingCrops.size * 5;
                adjacentInfo.adjacentExistingCrops.forEach((cropType) => {
                    if (conditions[cropType] !== undefined) {
                        score += 10; // High bonus for matching crops
                    }
                });

                // Adjacent mutations bonus
                adjacentInfo.adjacentMutations.forEach((mutId) => {
                    if (conditions[mutId] !== undefined) {
                        score += 8;
                    }
                    const adjMutation = getMutationData(mutId, this.unlockedMutations);
                    if (hasOnlyPositiveEffects(adjMutation)) {
                        score += 5;
                        if (hasSpreadEffect(mutation)) {
                            score += 10; // Effect spread near positive effects
                        }
                    }
                });

                // Efficiency bonus (fewer cells needed = better)
                score += (adjacentInfo.availableCells.length - remainingConditions) * 0.5;

                // Add some randomness if requested
                if (randomize) {
                    score += (Math.random() - 0.5) * 10;
                }

                candidates.push({ x, y, score, adjacentInfo });
            }
        }

        if (candidates.length === 0) return null;

        // Sort by score and pick best (or random from top 3 if randomizing)
        candidates.sort((a, b) => b.score - a.score);
        const chosen = randomize && candidates.length > 1
            ? candidates[Math.floor(Math.random() * Math.min(3, candidates.length))]
            : candidates[0];

        // Place the mutation
        state.placeMutation(chosen.x, chosen.y, mutationId, mw, mh);

        // Place required crops
        const crops: CropPlacement[] = [];
        const conditionEntries = Object.entries(conditions)
            .filter(([k]) => k !== 'adjacent_crops' && k !== 'special');
        let cellIndex = 0;

        for (const [crop, count] of conditionEntries) {
            const satisfiedByMutations = chosen.adjacentInfo.conditionsSatisfiedByMutations.get(crop) || 0;
            const satisfiedByCrops = chosen.adjacentInfo.conditionsSatisfiedByCrops.get(crop) || 0;
            const countValue = typeof count === 'number' ? count : 0;
            const remainingNeeded = countValue - satisfiedByMutations - satisfiedByCrops;

            // Register shared crops
            chosen.adjacentInfo.adjacentExistingCrops.forEach((existingCrop, key) => {
                if (existingCrop === crop) {
                    state.registerSharedCrop(key, mutationId);
                    const pos = parseKey(key);
                    crops.push({
                        position: pos,
                        cropType: crop,
                        sharedWith: state.getCropUsage(key),
                    });
                }
            });

            // Place new crops
            for (let i = 0; i < remainingNeeded && cellIndex < chosen.adjacentInfo.availableCells.length; i++) {
                const cell = chosen.adjacentInfo.availableCells[cellIndex++];
                state.placeCrop(cell.x, cell.y, crop, mutationId);
                crops.push({
                    position: cell,
                    cropType: crop,
                    sharedWith: [mutationId],
                });
            }
        }

        return {
            mutationId,
            position: { x: chosen.x, y: chosen.y },
            crops,
        };
    }

    // Find placement for isolation mutation
    private findIsolationPlacement(
        mutationId: string,
        state: LayoutState,
        randomize: boolean
    ): MutationPlacement | null {
        const mutation = getMutationData(mutationId, this.unlockedMutations);
        const [mw, mh] = parseSize(mutation.size);

        interface Candidate {
            x: number;
            y: number;
            score: number;
            adjacentCells: Position[];
        }

        const candidates: Candidate[] = [];

        for (let y = 0; y <= GRID_SIZE - mh; y++) {
            for (let x = 0; x <= GRID_SIZE - mw; x++) {
                if (!state.canPlaceMutation(x, y, mw, mh)) continue;
                if (state.hasCropAdjacent(x, y, mw, mh)) continue;

                const adjacentCells: Position[] = [];
                for (let dy = -1; dy <= mh; dy++) {
                    for (let dx = -1; dx <= mw; dx++) {
                        if (dy >= 0 && dy < mh && dx >= 0 && dx < mw) continue;
                        const ax = x + dx;
                        const ay = y + dy;
                        if (state.isCellAvailable(ax, ay)) {
                            adjacentCells.push({ x: ax, y: ay });
                        }
                    }
                }

                // Prefer positions with fewer available adjacent cells (corners/edges)
                let score = 100 - adjacentCells.length;
                if (randomize) {
                    score += (Math.random() - 0.5) * 20;
                }

                candidates.push({ x, y, score, adjacentCells });
            }
        }

        if (candidates.length === 0) return null;

        candidates.sort((a, b) => b.score - a.score);
        const chosen = randomize && candidates.length > 1
            ? candidates[Math.floor(Math.random() * Math.min(3, candidates.length))]
            : candidates[0];

        // Place mutation
        state.placeMutation(chosen.x, chosen.y, mutationId, mw, mh);

        // Mark adjacent cells as empty zones
        for (const cell of chosen.adjacentCells) {
            state.markEmptyZone(cell.x, cell.y);
        }

        return {
            mutationId,
            position: { x: chosen.x, y: chosen.y },
            crops: [],
        };
    }

    // Calculate fitness of a chromosome
    private calculateFitness(placements: MutationPlacement[]): number {
        let fitness = 0;

        // Reward for each placed mutation
        fitness += placements.length * WEIGHTS.placedMutation;

        // Calculate crop sharing
        const cropUsageCount = new Map<string, number>();
        for (const placement of placements) {
            for (const crop of placement.crops) {
                const key = cellKey(crop.position.x, crop.position.y);
                cropUsageCount.set(key, (cropUsageCount.get(key) || 0) + 1);
            }
        }
        cropUsageCount.forEach(count => {
            if (count > 1) {
                fitness += (count - 1) * WEIGHTS.cropSharing;
            }
        });

        // Spatial influence scoring
        this.influenceMap.updateFromPlacements(placements);
        for (const placement of placements) {
            const mutation = getMutationData(placement.mutationId, this.unlockedMutations);
            const [mw, mh] = parseSize(mutation.size);

            for (let dy = 0; dy < mh; dy++) {
                for (let dx = 0; dx < mw; dx++) {
                    const influence = this.influenceMap.getInfluence(
                        placement.position.x + dx,
                        placement.position.y + dy
                    );
                    fitness += influence.positiveInfluence * WEIGHTS.spatialInfluence * 0.1;
                    fitness -= influence.negativeInfluence * WEIGHTS.spatialInfluence * 0.05;
                }
            }

            // Bonus for effect_spread mutations near positive effects
            if (hasSpreadEffect(mutation)) {
                const centerX = placement.position.x + Math.floor(mw / 2);
                const centerY = placement.position.y + Math.floor(mh / 2);
                const influence = this.influenceMap.getInfluence(centerX, centerY);
                fitness += influence.positiveInfluence * WEIGHTS.effectSpreadBonus * 0.1;
            }
        }

        // Compactness bonus (smaller bounding box = better)
        if (placements.length > 0) {
            let minX = GRID_SIZE, maxX = 0, minY = GRID_SIZE, maxY = 0;
            for (const placement of placements) {
                const mutation = getMutationData(placement.mutationId, this.unlockedMutations);
                const [mw, mh] = parseSize(mutation.size);
                minX = Math.min(minX, placement.position.x);
                maxX = Math.max(maxX, placement.position.x + mw);
                minY = Math.min(minY, placement.position.y);
                maxY = Math.max(maxY, placement.position.y + mh);
            }
            const area = (maxX - minX) * (maxY - minY);
            fitness += (100 - area) * WEIGHTS.compactness * 0.1;
        }

        return fitness;
    }

    // Tournament selection
    private tournamentSelect(population: Chromosome[]): Chromosome {
        let best: Chromosome | null = null;
        for (let i = 0; i < TOURNAMENT_SIZE; i++) {
            const candidate = population[Math.floor(Math.random() * population.length)];
            if (!best || candidate.fitness > best.fitness) {
                best = candidate;
            }
        }
        return best!;
    }

    // Crossover two chromosomes
    private crossover(parent1: Chromosome, parent2: Chromosome): Chromosome {
        // Rule-based crossover: blend positions from both parents
        const state = new LayoutState(this.unlockedSlots);
        const placements: MutationPlacement[] = [];

        const parent1Positions = new Map<string, Position>();
        for (const p of parent1.placements) {
            parent1Positions.set(p.mutationId, p.position);
        }

        const parent2Positions = new Map<string, Position>();
        for (const p of parent2.placements) {
            parent2Positions.set(p.mutationId, p.position);
        }

        // Process regular targets
        for (const mutationId of this.regularTargets) {
            // Randomly select from parent1 or parent2's position
            const useParent2 = Math.random() < 0.5;
            const selectedPositions = useParent2 ? parent2Positions : parent1Positions;
            if (selectedPositions.has(mutationId)) {
                const selectedPos = selectedPositions.get(mutationId)!;
                const mutation = getMutationData(mutationId, this.unlockedMutations);
                const [mw, mh] = parseSize(mutation.size);

                if (state.canPlaceMutation(selectedPos.x, selectedPos.y, mw, mh)) {
                    const adjacentInfo = state.getAdjacentInfo(selectedPos.x, selectedPos.y, mw, mh, mutation.conditions);
                    // Check if conditions can be satisfied
                    let remainingConditions = 0;
                    Object.entries(mutation.conditions)
                        .filter(([k]) => k !== 'adjacent_crops' && k !== 'special')
                        .forEach(([crop, count]) => {
                            const satisfied = (adjacentInfo.conditionsSatisfiedByMutations.get(crop) || 0) +
                                (adjacentInfo.conditionsSatisfiedByCrops.get(crop) || 0);
                            remainingConditions += Math.max(0, (typeof count === 'number' ? count : 0) - satisfied);
                        });

                    if (adjacentInfo.availableCells.length >= remainingConditions) {
                        // Use selected parent's position
                        state.placeMutation(selectedPos.x, selectedPos.y, mutationId, mw, mh);
                        const crops: CropPlacement[] = [];
                        let cellIndex = 0;
                        Object.entries(mutation.conditions)
                            .filter(([k]) => k !== 'adjacent_crops' && k !== 'special')
                            .forEach(([crop, count]) => {
                                const satisfied = (adjacentInfo.conditionsSatisfiedByMutations.get(crop) || 0) +
                                    (adjacentInfo.conditionsSatisfiedByCrops.get(crop) || 0);
                                const needed = Math.max(0, (typeof count === 'number' ? count : 0) - satisfied);
                                for (let i = 0; i < needed && cellIndex < adjacentInfo.availableCells.length; i++) {
                                    const cell = adjacentInfo.availableCells[cellIndex++];
                                    state.placeCrop(cell.x, cell.y, crop, mutationId);
                                    crops.push({ position: cell, cropType: crop, sharedWith: [mutationId] });
                                }
                            });
                        placements.push({ mutationId, position: selectedPos, crops });
                        this.influenceMap.updateFromPlacements(placements);
                        continue;
                    }
                }
            }

            // Fall back to finding best placement
            const placement = this.findBestPlacement(mutationId, state, false);
            if (placement) {
                placements.push(placement);
                this.influenceMap.updateFromPlacements(placements);
            }
        }

        // Process isolation targets
        for (const mutationId of this.isolationTargets) {
            const placement = this.findIsolationPlacement(mutationId, state, false);
            if (placement) {
                placements.push(placement);
            }
        }

        const fitness = this.calculateFitness(placements);
        return { placements, fitness };
    }

    // Mutate a chromosome
    private mutateChromosome(chromosome: Chromosome): void {
        if (chromosome.placements.length === 0) return;

        // Pick a random placement to modify
        const idx = Math.floor(Math.random() * chromosome.placements.length);
        const placement = chromosome.placements[idx];

        // Try shifting position slightly
        const mutation = getMutationData(placement.mutationId, this.unlockedMutations);
        const [mw, mh] = parseSize(mutation.size);

        const dx = Math.floor(Math.random() * 3) - 1;
        const dy = Math.floor(Math.random() * 3) - 1;

        const newX = Math.max(0, Math.min(GRID_SIZE - mw, placement.position.x + dx));
        const newY = Math.max(0, Math.min(GRID_SIZE - mh, placement.position.y + dy));

        if (newX !== placement.position.x || newY !== placement.position.y) {
            placement.position = { x: newX, y: newY };
        }

        // Recalculate fitness would require full rebuild - mark as needing recalc
        chromosome.fitness = -1;
    }

    // Run the genetic algorithm
    run(): Chromosome {
        let population = this.generateInitialPopulation();

        for (let gen = 0; gen < GENERATIONS; gen++) {
            // Sort by fitness
            population.sort((a, b) => b.fitness - a.fitness);

            // Create next generation
            const nextGen: Chromosome[] = [];

            // Elitism: keep top performers
            for (let i = 0; i < ELITE_COUNT && i < population.length; i++) {
                nextGen.push(population[i]);
            }

            // Fill rest with crossover and mutation
            while (nextGen.length < POPULATION_SIZE) {
                const parent1 = this.tournamentSelect(population);
                const parent2 = this.tournamentSelect(population);
                let child = this.crossover(parent1, parent2);

                if (Math.random() < MUTATION_RATE) {
                    this.mutateChromosome(child);
                    // Rebuild if mutated
                    if (child.fitness === -1) {
                        child = this.rebuildChromosome(child);
                    }
                }

                nextGen.push(child);
            }

            population = nextGen;
        }

        // Return best chromosome
        population.sort((a, b) => b.fitness - a.fitness);
        return population[0];
    }

    // Rebuild a chromosome with proper placement logic
    private rebuildChromosome(chromosome: Chromosome): Chromosome {
        const state = new LayoutState(this.unlockedSlots);
        const placements: MutationPlacement[] = [];
        const positionHints = new Map<string, Position>();

        // Extract position hints from the mutated chromosome
        for (const p of chromosome.placements) {
            positionHints.set(p.mutationId, p.position);
        }

        // Rebuild with hints
        for (const mutationId of this.regularTargets) {
            const hint = positionHints.get(mutationId);
            const placement = hint
                ? this.tryPlacementAtHint(mutationId, hint, state) || this.findBestPlacement(mutationId, state, false)
                : this.findBestPlacement(mutationId, state, false);

            if (placement) {
                placements.push(placement);
                this.influenceMap.updateFromPlacements(placements);
            }
        }

        for (const mutationId of this.isolationTargets) {
            const placement = this.findIsolationPlacement(mutationId, state, false);
            if (placement) {
                placements.push(placement);
            }
        }

        const fitness = this.calculateFitness(placements);
        return { placements, fitness };
    }

    // Try to place at a specific hint position
    private tryPlacementAtHint(mutationId: string, hint: Position, state: LayoutState): MutationPlacement | null {
        const mutation = getMutationData(mutationId, this.unlockedMutations);
        const [mw, mh] = parseSize(mutation.size);

        if (!state.canPlaceMutation(hint.x, hint.y, mw, mh)) return null;

        const adjacentInfo = state.getAdjacentInfo(hint.x, hint.y, mw, mh, mutation.conditions);
        let remainingConditions = 0;
        Object.entries(mutation.conditions)
            .filter(([k]) => k !== 'adjacent_crops' && k !== 'special')
            .forEach(([crop, count]) => {
                const satisfied = (adjacentInfo.conditionsSatisfiedByMutations.get(crop) || 0) +
                    (adjacentInfo.conditionsSatisfiedByCrops.get(crop) || 0);
                remainingConditions += Math.max(0, (typeof count === 'number' ? count : 0) - satisfied);
            });

        if (adjacentInfo.availableCells.length < remainingConditions) return null;

        state.placeMutation(hint.x, hint.y, mutationId, mw, mh);
        const crops: CropPlacement[] = [];
        let cellIndex = 0;

        Object.entries(mutation.conditions)
            .filter(([k]) => k !== 'adjacent_crops' && k !== 'special')
            .forEach(([crop, count]) => {
                const satisfied = (adjacentInfo.conditionsSatisfiedByMutations.get(crop) || 0) +
                    (adjacentInfo.conditionsSatisfiedByCrops.get(crop) || 0);
                const needed = Math.max(0, (typeof count === 'number' ? count : 0) - satisfied);

                // Register shared crops first
                adjacentInfo.adjacentExistingCrops.forEach((existingCrop, key) => {
                    if (existingCrop === crop) {
                        state.registerSharedCrop(key, mutationId);
                        crops.push({ position: parseKey(key), cropType: crop, sharedWith: state.getCropUsage(key) });
                    }
                });

                for (let i = 0; i < needed && cellIndex < adjacentInfo.availableCells.length; i++) {
                    const cell = adjacentInfo.availableCells[cellIndex++];
                    state.placeCrop(cell.x, cell.y, crop, mutationId);
                    crops.push({ position: cell, cropType: crop, sharedWith: [mutationId] });
                }
            });

        return { mutationId, position: hint, crops };
    }
}

// ============================================================================
// GRID BUILDER
// ============================================================================

const buildGridFromPlacements = (
    placements: MutationPlacement[],
    unlockedMutations: AvailableMutations,
    unlockedSlots: Set<string>
): { grid: Grid; mutations: PlacedMutation[] } => {
    const grid: Grid = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null));
    const mutations: PlacedMutation[] = [];
    const cropUsage = new Map<string, string[]>();

    for (const placement of placements) {
        const mutation = getMutationData(placement.mutationId, unlockedMutations);
        const [mw, mh] = parseSize(mutation.size);
        const needsIsolation = mutation.conditions.adjacent_crops === 0;

        // Place mutation area
        for (let dy = 0; dy < mh; dy++) {
            for (let dx = 0; dx < mw; dx++) {
                const cellX = placement.position.x + dx;
                const cellY = placement.position.y + dy;
                const isCenter = dx === Math.floor(mw / 2) && dy === Math.floor(mh / 2);

                grid[cellY][cellX] = {
                    type: 'mutation_area',
                    mutationId: placement.mutationId,
                    isCenter,
                    needsIsolation,
                };
            }
        }

        // Place crops
        const usedMutations: string[] = [];
        const sharedCrops: string[] = [];

        for (const crop of placement.crops) {
            const key = cellKey(crop.position.x, crop.position.y);
            if (!cropUsage.has(key)) {
                cropUsage.set(key, []);
            }
            cropUsage.get(key)!.push(placement.mutationId);

            const existingCell = grid[crop.position.y][crop.position.x];
            if (existingCell && existingCell.type === 'crop') {
                // Update existing crop with additional mutation
                if (!existingCell.forMutations) {
                    existingCell.forMutations = [existingCell.forMutation];
                }
                existingCell.forMutations.push(placement.mutationId);
                sharedCrops.push(key);
            } else if (!existingCell) {
                grid[crop.position.y][crop.position.x] = {
                    type: 'crop',
                    crop: crop.cropType,
                    forMutation: placement.mutationId,
                };
            }
        }

        // Handle isolation empty zones
        if (needsIsolation) {
            for (let dy = -1; dy <= mh; dy++) {
                for (let dx = -1; dx <= mw; dx++) {
                    if (dy >= 0 && dy < mh && dx >= 0 && dx < mw) continue;
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

        mutations.push({
            id: placement.mutationId,
            name: mutation.name,
            position: {
                x: placement.position.x,
                y: placement.position.y,
                adjacentCells: placement.crops.map(c => c.position),
            },
            size: mutation.size,
            conditions: mutation.conditions,
            needsIsolation,
            usedMutations,
            sharedCrops,
        });
    }

    return { grid, mutations };
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

export const optimizeLayout = (
    unlockedMutations: AvailableMutations,
    targetMutations: TargetMutations,
    unlockedSlots: Set<string>
): OptimizedLayout => {
    const targets = Array.from(targetMutations.entries());
    if (targets.length === 0) {
        return {
            grid: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(null)),
            mutations: [],
            unlockedSlots: new Set(unlockedSlots),
        };
    }

    // Expand targets to include multiple instances based on quantity
    const expandedTargets: string[] = [];
    targets.forEach(([mutationId, quantity]) => {
        for (let i = 0; i < quantity; i++) {
            expandedTargets.push(mutationId);
        }
    });

    // Run genetic optimizer
    const optimizer = new GeneticOptimizer(unlockedMutations, expandedTargets, unlockedSlots);
    const bestChromosome = optimizer.run();

    // Build grid from best solution
    const { grid, mutations } = buildGridFromPlacements(
        bestChromosome.placements,
        unlockedMutations,
        unlockedSlots
    );

    return { grid, mutations, unlockedSlots: new Set(unlockedSlots) };
};
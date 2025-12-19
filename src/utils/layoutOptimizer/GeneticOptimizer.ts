import { GRID_SIZE } from './constants';
import { PlacementContext } from './PlacementContext';
import { FeasibilityChecker } from './FeasibilityChecker';
import { PlacementScorer } from './PlacementScorer';
import { Placer } from './Placer';
import { FitnessCalculator } from './FitnessCalculator';
import { GreedySolver } from './GreedySolver';
import type { MutationParser } from './MutationParser';
import type { StrategyProfile, FeasiblePlacement, MutationPlacement } from './types';

interface Individual {
    ctx: PlacementContext;
    fitness: number;
}

// GA Constants
const GA_POPULATION_SIZE = 8;
const GA_GENERATIONS = 15;
const GA_ELITE_COUNT = 2;
const GA_MUTATION_RATE = 0.3;
const GA_CROSSOVER_RATE = 0.7;

export class GeneticOptimizer {
    private parser: MutationParser;
    private checker: FeasibilityChecker;
    private scorer: PlacementScorer;
    private placer: Placer;
    private fitness: FitnessCalculator;
    private greedy: GreedySolver;

    constructor(parser: MutationParser) {
        this.parser = parser;
        this.checker = new FeasibilityChecker();
        this.scorer = new PlacementScorer(parser);
        this.placer = new Placer();
        this.fitness = new FitnessCalculator(parser);
        this.greedy = new GreedySolver(parser);
    }

    optimize(
        targets: Array<{ mutationId: string; quantity: number }>,
        unlockedSlots: Set<string>,
        profile: StrategyProfile,
        targetCount: number
    ): PlacementContext {
        // Initialize population with diverse greedy solutions
        let population = this.initializePopulation(targets, unlockedSlots, profile, targetCount);

        for (let gen = 0; gen < GA_GENERATIONS; gen++) {
            // Sort by fitness (descending)
            population.sort((a, b) => b.fitness - a.fitness);

            // Create next generation
            const nextGen: Individual[] = [];

            // Elitism: keep best individuals
            for (let i = 0; i < GA_ELITE_COUNT && i < population.length; i++) {
                nextGen.push(population[i]);
            }

            // Fill rest with crossover and mutation
            while (nextGen.length < GA_POPULATION_SIZE) {
                // Tournament selection
                const parent1 = this.tournamentSelect(population);
                const parent2 = this.tournamentSelect(population);

                let child: Individual;

                if (Math.random() < GA_CROSSOVER_RATE) {
                    // Crossover
                    child = this.crossover(parent1, parent2, targets, unlockedSlots, profile, targetCount);
                } else {
                    // Clone one parent
                    child = {
                        ctx: parent1.ctx.clone(),
                        fitness: parent1.fitness,
                    };
                }

                // Mutation
                if (Math.random() < GA_MUTATION_RATE) {
                    this.mutate(child, profile, targetCount);
                }

                nextGen.push(child);
            }

            population = nextGen;
        }

        // Return best individual
        population.sort((a, b) => b.fitness - a.fitness);
        return population[0].ctx;
    }

    private initializePopulation(
        targets: Array<{ mutationId: string; quantity: number }>,
        unlockedSlots: Set<string>,
        profile: StrategyProfile,
        targetCount: number
    ): Individual[] {
        const population: Individual[] = [];

        // Create diverse initial solutions using different randomness levels
        const randomnessLevels = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7];

        for (let i = 0; i < GA_POPULATION_SIZE; i++) {
            const randomness = randomnessLevels[i % randomnessLevels.length];
            const variedProfile = { ...profile, randomness };

            const { ctx } = this.greedy.solve(targets, unlockedSlots, variedProfile);
            const state = this.fitness.recalculate(ctx, targetCount);
            const fitnessScore = this.fitness.toScore(state);

            population.push({ ctx, fitness: fitnessScore });
        }

        return population;
    }

    private tournamentSelect(population: Individual[]): Individual {
        const tournamentSize = 3;
        let best: Individual | null = null;

        for (let i = 0; i < tournamentSize; i++) {
            const candidate = population[Math.floor(Math.random() * population.length)];
            if (!best || candidate.fitness > best.fitness) {
                best = candidate;
            }
        }

        return best!;
    }

    private crossover(
        parent1: Individual,
        parent2: Individual,
        targets: Array<{ mutationId: string; quantity: number }>,
        unlockedSlots: Set<string>,
        profile: StrategyProfile,
        targetCount: number
    ): Individual {
        // Order-based crossover: take placement order from parent1, positions from parent2
        const child = new PlacementContext(unlockedSlots);

        const placements1 = parent1.ctx.mutations.getAll();
        const placements2 = parent2.ctx.mutations.getAll();

        // Create a map of instance -> position from parent2
        const positionMap = new Map<string, { x: number; y: number }>();
        for (const p of placements2) {
            positionMap.set(p.instanceId, { x: p.position.x, y: p.position.y });
        }

        // Try to place mutations in parent1's order but consider parent2's positions
        const placed = new Set<string>();

        for (const p1 of placements1) {
            if (placed.has(p1.instanceId)) continue;

            const mutation = this.parser.parse(p1.mutationId);
            const [w, h] = mutation.size;

            // Try parent2's position first
            const p2Pos = positionMap.get(p1.instanceId);
            let bestFeasible: FeasiblePlacement | null = null;
            let bestScore = -Infinity;

            if (p2Pos) {
                const feasible = this.checker.checkFeasibility(child, mutation, p2Pos.x, p2Pos.y);
                if (feasible) {
                    const score = this.scorer.score(feasible, mutation, child, profile);
                    if (score > bestScore) {
                        bestScore = score;
                        bestFeasible = feasible;
                    }
                }
            }

            // If parent2 position doesn't work, try parent1's position
            if (!bestFeasible) {
                const feasible = this.checker.checkFeasibility(child, mutation, p1.position.x, p1.position.y);
                if (feasible) {
                    const score = this.scorer.score(feasible, mutation, child, profile);
                    if (score > bestScore) {
                        bestScore = score;
                        bestFeasible = feasible;
                    }
                }
            }

            // If neither work, find any valid position
            if (!bestFeasible) {
                for (let y = 0; y <= GRID_SIZE - h && !bestFeasible; y++) {
                    for (let x = 0; x <= GRID_SIZE - w && !bestFeasible; x++) {
                        const feasible = this.checker.checkFeasibility(child, mutation, x, y);
                        if (feasible) {
                            const score = this.scorer.score(feasible, mutation, child, profile);
                            if (score > bestScore) {
                                bestScore = score;
                                bestFeasible = feasible;
                            }
                        }
                    }
                }
            }

            if (bestFeasible) {
                this.placer.executePlacement(child, mutation, bestFeasible, p1.instanceId);
                placed.add(p1.instanceId);
            }
        }

        const state = this.fitness.recalculate(child, targetCount);
        return { ctx: child, fitness: this.fitness.toScore(state) };
    }

    private mutate(individual: Individual, profile: StrategyProfile, targetCount: number): void {
        const placements = individual.ctx.mutations.getAll();
        if (placements.length === 0) return;

        // Pick a random mutation to relocate
        const toMove = placements[Math.floor(Math.random() * placements.length)];
        const mutation = this.parser.parse(toMove.mutationId);
        const [w, h] = mutation.size;

        // Remove it
        this.placer.removePlacement(individual.ctx, toMove.instanceId);

        // Find new valid positions
        const candidates: Array<{ feasible: FeasiblePlacement; score: number }> = [];
        for (let y = 0; y <= GRID_SIZE - h; y++) {
            for (let x = 0; x <= GRID_SIZE - w; x++) {
                const feasible = this.checker.checkFeasibility(individual.ctx, mutation, x, y);
                if (feasible) {
                    const score = this.scorer.score(feasible, mutation, individual.ctx, profile);
                    candidates.push({ feasible, score });
                }
            }
        }

        if (candidates.length > 0) {
            // Pick from top candidates with some randomness
            candidates.sort((a, b) => b.score - a.score);
            const topN = Math.min(5, candidates.length);
            const selected = candidates[Math.floor(Math.random() * topN)];
            this.placer.executePlacement(individual.ctx, mutation, selected.feasible, toMove.instanceId);
        }

        // Recalculate fitness
        const state = this.fitness.recalculate(individual.ctx, targetCount);
        individual.fitness = this.fitness.toScore(state);
    }
}

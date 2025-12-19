import {
    GRID_SIZE,
    SA_INITIAL_TEMP,
    SA_COOLING_RATE,
    SA_MIN_TEMP,
    SA_ITERATIONS_PER_TEMP,
    SA_REHEAT_THRESHOLD,
    SA_REHEAT_FACTOR,
    SA_MAX_REHEATS,
    SA_CONVERGENCE_THRESHOLD,
    SA_TABU_SIZE,
} from './constants';
import { FeasibilityChecker } from './FeasibilityChecker';
import { PlacementScorer } from './PlacementScorer';
import { Placer } from './Placer';
import { FitnessCalculator } from './FitnessCalculator';
import type { MutationParser } from './MutationParser';
import type { PlacementContext } from './PlacementContext';
import type { StrategyProfile, Move, FeasiblePlacement, MutationPlacement } from './types';

type MoveType = 'relocate' | 'swap';

interface TabuEntry {
    instanceId: string;
    positionKey: string;
    expiresAt: number;
}

export class SimulatedAnnealing {
    private parser: MutationParser;
    private checker: FeasibilityChecker;
    private scorer: PlacementScorer;
    private placer: Placer;
    private fitness: FitnessCalculator;

    constructor(parser: MutationParser) {
        this.parser = parser;
        this.checker = new FeasibilityChecker();
        this.scorer = new PlacementScorer(parser);
        this.placer = new Placer();
        this.fitness = new FitnessCalculator(parser);
    }

    optimize(
        ctx: PlacementContext,
        targetCount: number,
        profile: StrategyProfile
    ): PlacementContext {
        let current = ctx;
        let currentFitness = this.fitness.toScore(this.fitness.recalculate(current, targetCount));
        let best = current;
        let bestFitness = currentFitness;

        let temperature = SA_INITIAL_TEMP;
        let iterationsSinceImprovement = 0;
        let totalIterations = 0;
        let reheats = 0;

        // Tabu list to prevent revisiting recent moves
        const tabuList: TabuEntry[] = [];

        // Adaptive cooling rate based on acceptance ratio
        let acceptedMoves = 0;
        let totalMoves = 0;

        while (temperature > SA_MIN_TEMP) {
            const iterationsThisTemp = SA_ITERATIONS_PER_TEMP;

            for (let i = 0; i < iterationsThisTemp; i++) {
                totalIterations++;

                // Choose move type - prefer swaps when we have multiple mutations
                const placements = current.mutations.getAll();
                const moveType: MoveType = placements.length >= 2 && Math.random() < 0.3
                    ? 'swap'
                    : 'relocate';

                const move = moveType === 'swap'
                    ? this.generateSwapMove(current, profile, tabuList, totalIterations)
                    : this.generateMove(current, profile, tabuList, totalIterations);

                if (!move) continue;

                totalMoves++;

                // Clone and apply move
                const neighbor = current.clone();
                this.applyMove(neighbor, move, moveType);

                const neighborFitness = this.fitness.toScore(this.fitness.recalculate(neighbor, targetCount));
                const delta = neighborFitness - currentFitness;

                // Accept or reject with Metropolis criterion
                const acceptProbability = delta > 0 ? 1 : Math.exp(delta / temperature);

                if (Math.random() < acceptProbability) {
                    current = neighbor;
                    currentFitness = neighborFitness;
                    acceptedMoves++;

                    // Add to tabu list to prevent immediate reversal
                    this.addToTabu(tabuList, move, totalIterations);

                    if (currentFitness > bestFitness) {
                        best = current;
                        bestFitness = currentFitness;
                        iterationsSinceImprovement = 0;
                    }
                }
            }

            // Clean expired tabu entries
            this.cleanTabu(tabuList, totalIterations);

            iterationsSinceImprovement += iterationsThisTemp;

            // Adaptive cooling: adjust rate based on acceptance ratio
            const acceptanceRatio = totalMoves > 0 ? acceptedMoves / totalMoves : 0;
            const adaptiveCoolingRate = this.calculateAdaptiveCoolingRate(acceptanceRatio, temperature);
            temperature *= adaptiveCoolingRate;

            // Reheating mechanism: if stuck, reheat to escape local minimum
            if (iterationsSinceImprovement >= SA_REHEAT_THRESHOLD && reheats < SA_MAX_REHEATS) {
                temperature = SA_INITIAL_TEMP * SA_REHEAT_FACTOR * Math.pow(0.7, reheats);
                reheats++;
                iterationsSinceImprovement = 0;
                acceptedMoves = 0;
                totalMoves = 0;

                // Clear tabu list on reheat to allow fresh exploration
                tabuList.length = 0;
            }

            // Early convergence detection
            if (iterationsSinceImprovement >= SA_CONVERGENCE_THRESHOLD) {
                break;
            }

            // Reset acceptance counters periodically
            if (totalMoves > 100) {
                acceptedMoves = Math.floor(acceptedMoves / 2);
                totalMoves = Math.floor(totalMoves / 2);
            }
        }

        return best;
    }

    private calculateAdaptiveCoolingRate(acceptanceRatio: number, currentTemp: number): number {
        // Target acceptance ratio around 20-40% for good exploration/exploitation balance
        if (acceptanceRatio > 0.5) {
            // Too many accepts - cool faster
            return SA_COOLING_RATE * 0.98;
        } else if (acceptanceRatio < 0.1 && currentTemp > SA_MIN_TEMP * 10) {
            // Too few accepts - cool slower
            return SA_COOLING_RATE * 1.01;
        }
        return SA_COOLING_RATE;
    }

    private isTabu(tabuList: TabuEntry[], instanceId: string, x: number, y: number, currentIteration: number): boolean {
        const posKey = `${x},${y}`;
        return tabuList.some(entry =>
            entry.instanceId === instanceId &&
            entry.positionKey === posKey &&
            entry.expiresAt > currentIteration
        );
    }

    private addToTabu(tabuList: TabuEntry[], move: Move | SwapMove, currentIteration: number): void {
        if ('remove' in move) {
            // Relocate move - add old position to tabu
            tabuList.push({
                instanceId: move.remove,
                positionKey: `${move.newPosition.position.x},${move.newPosition.position.y}`,
                expiresAt: currentIteration + SA_TABU_SIZE,
            });
        }

        // Keep tabu list bounded
        while (tabuList.length > SA_TABU_SIZE * 2) {
            tabuList.shift();
        }
    }

    private cleanTabu(tabuList: TabuEntry[], currentIteration: number): void {
        for (let i = tabuList.length - 1; i >= 0; i--) {
            if (tabuList[i].expiresAt <= currentIteration) {
                tabuList.splice(i, 1);
            }
        }
    }

    private generateMove(
        ctx: PlacementContext,
        profile: StrategyProfile,
        tabuList: TabuEntry[],
        currentIteration: number
    ): Move | null {
        const placements = ctx.mutations.getAll();
        if (placements.length === 0) return null;

        // Try multiple mutations to find a valid move
        const shuffledIndices = this.shuffleArray([...Array(placements.length).keys()]);

        for (const idx of shuffledIndices.slice(0, Math.min(3, placements.length))) {
            const toMove = placements[idx];
            const mutation = this.parser.parse(toMove.mutationId);
            const [w, h] = mutation.size;

            // Create temporary context without this mutation
            const tempCtx = ctx.clone();
            this.placer.removePlacement(tempCtx, toMove.instanceId);

            // Find new valid positions, avoiding tabu moves
            const candidates: Array<{ feasible: FeasiblePlacement; score: number }> = [];
            for (let y = 0; y <= GRID_SIZE - h; y++) {
                for (let x = 0; x <= GRID_SIZE - w; x++) {
                    // Skip tabu positions
                    if (this.isTabu(tabuList, toMove.instanceId, x, y, currentIteration)) {
                        continue;
                    }

                    // Skip current position (no-op)
                    if (x === toMove.position.x && y === toMove.position.y) {
                        continue;
                    }

                    const feasible = this.checker.checkFeasibility(tempCtx, mutation, x, y);
                    if (feasible) {
                        const score = this.scorer.score(feasible, mutation, tempCtx, profile);
                        candidates.push({ feasible, score });
                    }
                }
            }

            if (candidates.length === 0) continue;

            // Sort by score and pick from top candidates with some randomization
            candidates.sort((a, b) => b.score - a.score);
            const topN = Math.min(5, candidates.length);

            // Temperature-dependent selection: higher temp = more random
            const selectionIndex = Math.floor(Math.random() * topN);
            const selected = candidates[selectionIndex];

            return {
                remove: toMove.instanceId,
                newPosition: selected.feasible,
                mutation,
            };
        }

        return null;
    }

    private generateSwapMove(
        ctx: PlacementContext,
        profile: StrategyProfile,
        tabuList: TabuEntry[],
        currentIteration: number
    ): SwapMove | null {
        const placements = ctx.mutations.getAll();
        if (placements.length < 2) return null;

        // Pick two random mutations to swap
        const indices = this.shuffleArray([...Array(placements.length).keys()]);
        const p1 = placements[indices[0]];
        const p2 = placements[indices[1]];

        // Check if they can be swapped (same size for simplicity)
        const m1 = this.parser.parse(p1.mutationId);
        const m2 = this.parser.parse(p2.mutationId);

        if (m1.size[0] !== m2.size[0] || m1.size[1] !== m2.size[1]) {
            return null;
        }

        // Check tabu
        if (this.isTabu(tabuList, p1.instanceId, p2.position.x, p2.position.y, currentIteration) ||
            this.isTabu(tabuList, p2.instanceId, p1.position.x, p1.position.y, currentIteration)) {
            return null;
        }

        return {
            placement1: p1,
            placement2: p2,
            mutation1: m1,
            mutation2: m2,
        };
    }

    private applyMove(ctx: PlacementContext, move: Move | SwapMove, moveType: MoveType): void {
        if (moveType === 'relocate') {
            const relocateMove = move as Move;
            this.placer.removePlacement(ctx, relocateMove.remove);
            this.placer.executePlacement(ctx, relocateMove.mutation, relocateMove.newPosition, relocateMove.remove);
        } else {
            const swapMove = move as SwapMove;
            // Remove both placements
            this.placer.removePlacement(ctx, swapMove.placement1.instanceId);
            this.placer.removePlacement(ctx, swapMove.placement2.instanceId);

            // Check feasibility at swapped positions
            const feasible1 = this.checker.checkFeasibility(ctx, swapMove.mutation1,
                swapMove.placement2.position.x, swapMove.placement2.position.y);
            const feasible2 = this.checker.checkFeasibility(ctx, swapMove.mutation2,
                swapMove.placement1.position.x, swapMove.placement1.position.y);

            if (feasible1 && feasible2) {
                // Execute swap
                this.placer.executePlacement(ctx, swapMove.mutation1, feasible1, swapMove.placement1.instanceId);
                this.placer.executePlacement(ctx, swapMove.mutation2, feasible2, swapMove.placement2.instanceId);
            } else {
                // Swap not feasible, restore original positions
                const origFeasible1 = this.checker.checkFeasibility(ctx, swapMove.mutation1,
                    swapMove.placement1.position.x, swapMove.placement1.position.y);
                const origFeasible2 = this.checker.checkFeasibility(ctx, swapMove.mutation2,
                    swapMove.placement2.position.x, swapMove.placement2.position.y);

                if (origFeasible1) {
                    this.placer.executePlacement(ctx, swapMove.mutation1, origFeasible1, swapMove.placement1.instanceId);
                }
                if (origFeasible2) {
                    this.placer.executePlacement(ctx, swapMove.mutation2, origFeasible2, swapMove.placement2.instanceId);
                }
            }
        }
    }

    private shuffleArray<T>(array: T[]): T[] {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

// Swap move interface
interface SwapMove {
    placement1: MutationPlacement;
    placement2: MutationPlacement;
    mutation1: import('./types').ParsedMutation;
    mutation2: import('./types').ParsedMutation;
}

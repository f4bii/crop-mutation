import type { StrategyProfile } from './types';

export const GRID_SIZE = 10;

// Simulated annealing parameters - tuned based on metaheuristics research
export const SA_INITIAL_TEMP = 100;
export const SA_COOLING_RATE = 0.97;          // Slower cooling for better exploration
export const SA_MIN_TEMP = 0.01;              // Lower minimum for fine-tuning
export const SA_ITERATIONS_PER_TEMP = 30;     // Balanced iterations per temperature

// Adaptive SA parameters
export const SA_REHEAT_THRESHOLD = 50;        // Iterations without improvement before reheating
export const SA_REHEAT_FACTOR = 0.5;          // Reheat to 50% of initial temperature
export const SA_MAX_REHEATS = 3;              // Maximum number of reheats allowed
export const SA_CONVERGENCE_THRESHOLD = 100;  // Iterations without improvement to consider converged
export const SA_TABU_SIZE = 10;               // Size of tabu list for move diversity

export const STRATEGIES: StrategyProfile[] = [
    { name: 'compact-balanced', sharingWeight: 1, compactnessWeight: 2, synergyWeight: 0.5, cornerWeight: 1, randomness: 0 },
    { name: 'ultra-compact', sharingWeight: 0.5, compactnessWeight: 3, synergyWeight: 0.3, cornerWeight: 0.5, randomness: 0 },
    { name: 'compact-sharing', sharingWeight: 1.5, compactnessWeight: 2, synergyWeight: 0.5, cornerWeight: 0.5, randomness: 0 },
    { name: 'tight-cluster', sharingWeight: 0.8, compactnessWeight: 2.5, synergyWeight: 0.5, cornerWeight: 1, randomness: 0 },
    { name: 'exploration', sharingWeight: 1, compactnessWeight: 1.5, synergyWeight: 0.5, cornerWeight: 1, randomness: 0.2 },
];

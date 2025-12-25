import type {
  OptimizerState,
  OptimizerConfig,
  OptimizerResult,
  OptimizerProgress,
  MoveType
} from '@types';
import { getMutationData } from '@data/mutationsData';
import { MUTATION_TIERS } from '@utils/tierUtils';
import {
  createEmptyState,
  deepCloneState,
  canPlaceMutation,
  placeMutationWithCrops,
  removeMutation,
  getRandomPlacedMutation,
  getEmptyUnlockedCells,
  shuffleArray,
  validateAndCleanState
} from './stateManager';
import { getGeometryCached, MUTATIONS_BY_SIZE, canFitInUnlockedSlots } from './geometry';
import { hasSpecialConditions, getRequiredMutations } from './cropSolver';
import { calculateScore } from './scoring';

const MOVE_TYPES: MoveType[] = ['ADD_MUTATION', 'REMOVE_MUTATION', 'MOVE_MUTATION', 'SWAP_MUTATION'];

/**
 * Filter mutations to only include those that can potentially be placed
 * (exclude special condition mutations and those requiring other mutations not in the list)
 */
function filterPlaceableMutations(availableMutations: string[]): string[] {
  const availableSet = new Set(availableMutations);

  return availableMutations.filter(mutationId => {
    // Skip mutations with special conditions
    if (hasSpecialConditions(mutationId)) {
      return false;
    }

    // Check if all required mutations are in the available list
    const requiredMutations = getRequiredMutations(mutationId);
    for (const [requiredId] of requiredMutations) {
      if (!availableSet.has(requiredId)) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get mutations that only require crops (no mutation dependencies)
 * These can be placed independently
 */
function getCropOnlyMutations(availableMutations: string[]): string[] {
  return availableMutations.filter(mutationId => {
    if (hasSpecialConditions(mutationId)) return false;
    const requiredMutations = getRequiredMutations(mutationId);
    return requiredMutations.size === 0;
  });
}

/**
 * Weighted random selection of mutations (prefer higher tier)
 */
function getWeightedRandomMutation(availableMutations: string[]): string {
  if (availableMutations.length === 0) {
    throw new Error('No available mutations');
  }

  const weights = availableMutations.map(id => {
    const tier = MUTATION_TIERS[id] || 0;
    return 1 + tier * 0.5;
  });

  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;

  for (let i = 0; i < availableMutations.length; i++) {
    random -= weights[i];
    if (random <= 0) {
      return availableMutations[i];
    }
  }

  return availableMutations[availableMutations.length - 1];
}

/**
 * Get a random mutation of the same size
 */
function getRandomMutationSameSize(size: string, exclude: string, availableMutations: string[]): string | null {
  const sameSize = MUTATIONS_BY_SIZE.get(size) || [];
  const candidates = sameSize.filter(id =>
    id !== exclude &&
    availableMutations.includes(id) &&
    !hasSpecialConditions(id)
  );

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Try to add a random mutation to the state
 */
function tryAddMutation(
  state: OptimizerState,
  availableMutations: string[],
  unlockedSlots: Set<string>
): boolean {
  if (availableMutations.length === 0) return false;

  const mutationId = getWeightedRandomMutation(availableMutations);
  const geometry = getGeometryCached(mutationId);

  // Get shuffled list of possible positions
  const emptyCells = shuffleArray(getEmptyUnlockedCells(state, unlockedSlots));

  for (const cell of emptyCells) {
    // Check if mutation fits at this position
    if (!canFitInUnlockedSlots(cell, geometry, unlockedSlots)) continue;

    if (canPlaceMutation(mutationId, cell, state, unlockedSlots)) {
      const placedId = placeMutationWithCrops(mutationId, cell, state, unlockedSlots);
      if (placedId) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Try to remove a random mutation from the state
 */
function tryRemoveMutation(state: OptimizerState): boolean {
  const mutation = getRandomPlacedMutation(state);
  if (!mutation) return false;

  return removeMutation(mutation.id, state);
}

/**
 * Try to move a random mutation to a new position
 */
function tryMoveMutation(
  state: OptimizerState,
  unlockedSlots: Set<string>
): boolean {
  const mutation = getRandomPlacedMutation(state);
  if (!mutation) return false;

  const oldPosition = { ...mutation.position };
  const mutationId = mutation.mutationId;
  const geometry = getGeometryCached(mutationId);

  // Remove the mutation
  removeMutation(mutation.id, state);

  // Get shuffled list of possible new positions
  const emptyCells = shuffleArray(getEmptyUnlockedCells(state, unlockedSlots));

  for (const cell of emptyCells) {
    if (!canFitInUnlockedSlots(cell, geometry, unlockedSlots)) continue;

    if (canPlaceMutation(mutationId, cell, state, unlockedSlots)) {
      const placedId = placeMutationWithCrops(mutationId, cell, state, unlockedSlots);
      if (placedId) {
        return true;
      }
    }
  }

  // Rollback: couldn't find a new position, put it back
  placeMutationWithCrops(mutationId, oldPosition, state, unlockedSlots);

  return false;
}

/**
 * Try to swap a mutation with a different one of the same size
 */
function trySwapMutation(
  state: OptimizerState,
  availableMutations: string[],
  unlockedSlots: Set<string>
): boolean {
  const oldMutation = getRandomPlacedMutation(state);
  if (!oldMutation) return false;

  const mutation = getMutationData(oldMutation.mutationId);
  if (!mutation) return false;

  const newMutationId = getRandomMutationSameSize(mutation.size, oldMutation.mutationId, availableMutations);
  if (!newMutationId) return false;

  const position = { ...oldMutation.position };

  // Remove old mutation
  removeMutation(oldMutation.id, state);

  // Try to place new mutation
  if (canPlaceMutation(newMutationId, position, state, unlockedSlots)) {
    const placedId = placeMutationWithCrops(newMutationId, position, state, unlockedSlots);
    if (placedId) {
      return true;
    }
  }

  // Rollback: put the old mutation back
  placeMutationWithCrops(oldMutation.mutationId, position, state, unlockedSlots);

  return false;
}

/**
 * Create a greedy initial seed - only place crop-only mutations first
 */
function greedySeed(
  state: OptimizerState,
  availableMutations: string[],
  unlockedSlots: Set<string>,
  objectiveType: 'MAX_MUTATIONS' | 'MAX_PROFIT'
): void {
  // First, only try to place mutations that don't require other mutations
  const cropOnlyMutations = getCropOnlyMutations(availableMutations);

  // Sort by tier (descending) for greedy seeding
  let sortedMutations = [...cropOnlyMutations].sort((a, b) => {
    const tierA = MUTATION_TIERS[a] || 0;
    const tierB = MUTATION_TIERS[b] || 0;
    return tierB - tierA;
  });

  // For MAX_MUTATIONS, prioritize smaller mutations (1x1) to fit more
  if (objectiveType === 'MAX_MUTATIONS') {
    sortedMutations = sortedMutations.sort((a, b) => {
      const mutA = getMutationData(a);
      const mutB = getMutationData(b);
      if (!mutA || !mutB) return 0;
      const sizeA = parseInt(mutA.size.split('x')[0]);
      const sizeB = parseInt(mutB.size.split('x')[0]);
      return sizeA - sizeB;
    });
  }

  // Try to place each mutation once
  for (const mutationId of sortedMutations) {
    const geometry = getGeometryCached(mutationId);
    const emptyCells = getEmptyUnlockedCells(state, unlockedSlots);

    for (const cell of emptyCells) {
      if (!canFitInUnlockedSlots(cell, geometry, unlockedSlots)) continue;

      if (canPlaceMutation(mutationId, cell, state, unlockedSlots)) {
        const placedId = placeMutationWithCrops(mutationId, cell, state, unlockedSlots);
        if (placedId) {
          break; // Move to next mutation
        }
      }
    }
  }
}

/**
 * Calculate acceptance probability for simulated annealing
 */
function acceptanceProbability(currentScore: number, newScore: number, temperature: number): number {
  if (newScore > currentScore) {
    return 1.0;
  }
  return Math.exp((newScore - currentScore) / temperature);
}

/**
 * Main simulated annealing optimization loop
 */
export function optimizeLayout(
  unlockedSlots: Set<string>,
  availableMutations: string[],
  config: OptimizerConfig,
  onProgress?: (progress: OptimizerProgress) => void
): OptimizerResult {
  const { maxIterations, startTemperature, coolingRate, objectiveType } = config;

  // Filter to only placeable mutations
  const placeableMutations = filterPlaceableMutations(availableMutations);

  if (placeableMutations.length === 0) {
    // Return empty result if no mutations can be placed
    const emptyState = createEmptyState();
    return {
      state: emptyState,
      iterations: 0,
      finalScore: 0,
      bestScore: 0,
      history: []
    };
  }

  // Create initial state
  let state = createEmptyState();

  // Greedy seed initialization with crop-only mutations
  greedySeed(state, placeableMutations, unlockedSlots, objectiveType);

  // Calculate initial score
  state.score = calculateScore(state, objectiveType);

  // Track best state
  let bestState = deepCloneState(state);
  let bestScore = state.score;

  // History for visualization
  const history: { iteration: number; score: number; temperature: number }[] = [];

  let temperature = startTemperature;

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    // Create candidate state
    const candidate = deepCloneState(state);

    // Choose random move type
    const moveType = MOVE_TYPES[Math.floor(Math.random() * MOVE_TYPES.length)];

    let moveSucceeded = false;

    switch (moveType) {
      case 'ADD_MUTATION':
        moveSucceeded = tryAddMutation(candidate, placeableMutations, unlockedSlots);
        break;
      case 'REMOVE_MUTATION':
        moveSucceeded = tryRemoveMutation(candidate);
        break;
      case 'MOVE_MUTATION':
        moveSucceeded = tryMoveMutation(candidate, unlockedSlots);
        break;
      case 'SWAP_MUTATION':
        moveSucceeded = trySwapMutation(candidate, placeableMutations, unlockedSlots);
        break;
    }

    if (moveSucceeded) {
      // Calculate new score
      candidate.score = calculateScore(candidate, objectiveType);

      const delta = candidate.score - state.score;

      // Accept or reject based on annealing probability
      if (delta > 0 || Math.random() < acceptanceProbability(state.score, candidate.score, temperature)) {
        state = candidate;

        // Update best if improved
        if (state.score > bestScore) {
          bestState = deepCloneState(state);
          bestScore = state.score;
        }
      }
    }

    // Cool down temperature
    temperature = temperature * coolingRate;

    // Record history periodically
    if (iteration % Math.max(1, Math.floor(maxIterations / 100)) === 0) {
      history.push({
        iteration,
        score: state.score,
        temperature
      });
    }

    // Report progress
    if (onProgress && iteration % Math.max(1, Math.floor(maxIterations / 50)) === 0) {
      onProgress({
        iteration,
        maxIterations,
        currentScore: state.score,
        bestScore,
        temperature,
        placedMutationsCount: state.placedMutations.size
      });
    }
  }

  // Final validation: remove any mutations that somehow became invalid
  validateAndCleanState(bestState);
  bestState.score = calculateScore(bestState, objectiveType);

  return {
    state: bestState,
    iterations: maxIterations,
    finalScore: state.score,
    bestScore: bestState.score,
    history
  };
}

/**
 * Default optimizer configuration
 */
export const DEFAULT_CONFIG: OptimizerConfig = {
  maxIterations: 20000,
  startTemperature: 200,
  coolingRate: 0.9995,
  objectiveType: 'MAX_MUTATIONS'
};

/**
 * Quick optimization preset
 */
export const QUICK_CONFIG: OptimizerConfig = {
  maxIterations: 1000,
  startTemperature: 50,
  coolingRate: 0.99,
  objectiveType: 'MAX_MUTATIONS'
};

/**
 * Thorough optimization preset
 */
export const THOROUGH_CONFIG: OptimizerConfig = {
  maxIterations: 50000,
  startTemperature: 500,
  coolingRate: 0.9999,
  objectiveType: 'MAX_MUTATIONS'
};

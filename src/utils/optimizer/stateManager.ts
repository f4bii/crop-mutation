import type {
  Position,
  OptimizerState,
  OptimizerPlacedMutation,
  OptimizerPlacedCrop
} from '@types';
import { getGeometryCached, getOccupiedCells, canFitInUnlockedSlots, canFitInGrid } from './geometry';
import {
  findCropPlacements,
  needsIsolation,
  wouldViolateIsolation,
  canSatisfyConditions,
  areConditionsSatisfied,
  hasSpecialConditions
} from './cropSolver';
import { getMutationData } from '@data/mutationsData';

let mutationCounter = 0;
let cropCounter = 0;

function generateMutationId(): string {
  return `mutation_${++mutationCounter}`;
}

function generateCropId(): string {
  return `crop_${++cropCounter}`;
}

/**
 * Create an empty optimizer state
 */
export function createEmptyState(gridSize: number = 10): OptimizerState {
  const grid: (string | null)[][] = [];
  for (let y = 0; y < gridSize; y++) {
    grid.push(new Array(gridSize).fill(null));
  }

  return {
    grid,
    placedMutations: new Map(),
    placedCrops: new Map(),
    score: 0
  };
}

/**
 * Deep clone an optimizer state
 */
export function deepCloneState(state: OptimizerState): OptimizerState {
  const newGrid = state.grid.map(row => [...row]);

  const newPlacedMutations = new Map<string, OptimizerPlacedMutation>();
  for (const [id, mutation] of state.placedMutations) {
    newPlacedMutations.set(id, {
      ...mutation,
      position: { ...mutation.position },
      geometry: { ...mutation.geometry },
      satisfyingCrops: new Map(Array.from(mutation.satisfyingCrops.entries()).map(
        ([k, v]) => [k, v.map(p => ({ ...p }))]
      )),
      satisfyingMutations: new Map(Array.from(mutation.satisfyingMutations.entries()).map(
        ([k, v]) => [k, [...v]]
      ))
    });
  }

  const newPlacedCrops = new Map<string, OptimizerPlacedCrop>();
  for (const [id, crop] of state.placedCrops) {
    newPlacedCrops.set(id, {
      ...crop,
      position: { ...crop.position },
      forMutations: [...crop.forMutations]
    });
  }

  return {
    grid: newGrid,
    placedMutations: newPlacedMutations,
    placedCrops: newPlacedCrops,
    score: state.score
  };
}

/**
 * Check if a cell is occupied
 */
export function isCellOccupied(state: OptimizerState, position: Position): boolean {
  return state.grid[position.y]?.[position.x] !== null;
}

/**
 * Check if a mutation can be placed at a position (basic checks only)
 */
export function canPlaceMutation(
  mutationId: string,
  position: Position,
  state: OptimizerState,
  unlockedSlots: Set<string>
): boolean {
  const geometry = getGeometryCached(mutationId);
  const mutation = getMutationData(mutationId);

  if (!mutation) return false;

  // Skip mutations with special conditions
  if (hasSpecialConditions(mutationId)) return false;

  // Check grid bounds
  if (!canFitInGrid(position, geometry)) return false;

  // Check unlocked slots
  if (!canFitInUnlockedSlots(position, geometry, unlockedSlots)) return false;

  // Check for overlaps with existing placements
  const occupiedCells = getOccupiedCells(position, geometry);
  for (const cell of occupiedCells) {
    if (isCellOccupied(state, cell)) return false;
  }

  // Check if conditions CAN be satisfied at this position
  if (!canSatisfyConditions(mutationId, position, state, unlockedSlots)) {
    return false;
  }

  return true;
}

/**
 * Place a mutation on the grid (without crops)
 */
export function placeMutation(
  mutationId: string,
  position: Position,
  state: OptimizerState,
  unlockedSlots: Set<string>
): { success: boolean; placedId: string | null } {
  if (!canPlaceMutation(mutationId, position, state, unlockedSlots)) {
    return { success: false, placedId: null };
  }

  const geometry = getGeometryCached(mutationId);
  const placedId = generateMutationId();

  // Mark cells as occupied
  const occupiedCells = getOccupiedCells(position, geometry);
  for (const cell of occupiedCells) {
    state.grid[cell.y][cell.x] = placedId;
  }

  // Add to placed mutations
  const placedMutation: OptimizerPlacedMutation = {
    id: placedId,
    mutationId,
    position,
    geometry,
    satisfyingCrops: new Map(),
    satisfyingMutations: new Map()
  };
  state.placedMutations.set(placedId, placedMutation);

  return { success: true, placedId };
}

/**
 * Remove a mutation and its associated crops from the grid
 */
export function removeMutation(placedId: string, state: OptimizerState): boolean {
  const placedMutation = state.placedMutations.get(placedId);
  if (!placedMutation) return false;

  // Clear cells occupied by mutation
  const occupiedCells = getOccupiedCells(placedMutation.position, placedMutation.geometry);
  for (const cell of occupiedCells) {
    state.grid[cell.y][cell.x] = null;
  }

  // Remove associated crops
  for (const [, positions] of placedMutation.satisfyingCrops) {
    for (const pos of positions) {
      // Find and remove crop at this position
      for (const [cropId, crop] of state.placedCrops) {
        if (crop.position.x === pos.x && crop.position.y === pos.y) {
          // Remove this mutation from crop's forMutations
          crop.forMutations = crop.forMutations.filter(id => id !== placedId);
          // If no mutations depend on this crop, remove it
          if (crop.forMutations.length === 0) {
            state.grid[crop.position.y][crop.position.x] = null;
            state.placedCrops.delete(cropId);
          }
          break;
        }
      }
    }
  }

  state.placedMutations.delete(placedId);
  return true;
}

/**
 * Place a crop on the grid
 */
export function placeCrop(
  cropType: string,
  position: Position,
  forMutationId: string,
  state: OptimizerState,
  unlockedSlots: Set<string>
): { success: boolean; placedId: string | null } {
  // Check if cell is in unlocked slots
  if (!unlockedSlots.has(`${position.y},${position.x}`)) {
    return { success: false, placedId: null };
  }

  // Check if cell is occupied
  const existing = state.grid[position.y]?.[position.x];

  if (existing !== null) {
    // Check if it's an existing crop of the same type
    const existingCrop = state.placedCrops.get(existing);
    if (existingCrop && existingCrop.crop === cropType) {
      // Add this mutation to its forMutations
      if (!existingCrop.forMutations.includes(forMutationId)) {
        existingCrop.forMutations.push(forMutationId);
      }
      return { success: true, placedId: existing };
    }
    return { success: false, placedId: null };
  }

  // Check if this would violate isolation rules
  if (wouldViolateIsolation(position, state)) {
    return { success: false, placedId: null };
  }

  const placedId = generateCropId();

  state.grid[position.y][position.x] = placedId;
  state.placedCrops.set(placedId, {
    id: placedId,
    crop: cropType,
    position,
    forMutations: [forMutationId]
  });

  return { success: true, placedId };
}

/**
 * Place required crops for a mutation and verify they satisfy requirements
 * Returns false if requirements cannot be satisfied
 */
export function placeRequiredCrops(
  placedMutationId: string,
  state: OptimizerState,
  unlockedSlots: Set<string>
): boolean {
  const placedMutation = state.placedMutations.get(placedMutationId);
  if (!placedMutation) return false;

  // Skip if mutation needs isolation (no crops needed)
  if (needsIsolation(placedMutation.mutationId)) {
    return true;
  }

  const cropPlacements = findCropPlacements(
    placedMutation.mutationId,
    placedMutation.position,
    state,
    unlockedSlots
  );

  // If we can't find valid placements, fail
  if (cropPlacements === null) {
    return false;
  }

  // Place each crop
  for (const [cropType, positions] of cropPlacements) {
    for (const pos of positions) {
      const result = placeCrop(cropType, pos, placedMutationId, state, unlockedSlots);
      if (result.success && result.placedId) {
        // Track that this crop satisfies this mutation
        if (!placedMutation.satisfyingCrops.has(cropType)) {
          placedMutation.satisfyingCrops.set(cropType, []);
        }
        placedMutation.satisfyingCrops.get(cropType)!.push(pos);
      }
    }
  }

  // Verify that after placing crops, the mutation's conditions are satisfied
  const { satisfied } = areConditionsSatisfied(
    placedMutation.mutationId,
    placedMutation.position,
    state
  );

  return satisfied;
}

/**
 * Place a mutation with all its required crops, with verification
 * Returns the placed ID if successful, null if failed
 */
export function placeMutationWithCrops(
  mutationId: string,
  position: Position,
  state: OptimizerState,
  unlockedSlots: Set<string>
): string | null {
  const { success, placedId } = placeMutation(mutationId, position, state, unlockedSlots);

  if (!success || !placedId) {
    return null;
  }

  // Place required crops
  const cropsPlaced = placeRequiredCrops(placedId, state, unlockedSlots);

  if (!cropsPlaced) {
    // Failed to place crops - rollback the mutation
    removeMutation(placedId, state);
    return null;
  }

  return placedId;
}

/**
 * Validate all mutations in a state and remove invalid ones
 */
export function validateAndCleanState(state: OptimizerState): number {
  let removedCount = 0;
  const toRemove: string[] = [];

  for (const [placedId, placedMutation] of state.placedMutations) {
    const { satisfied } = areConditionsSatisfied(
      placedMutation.mutationId,
      placedMutation.position,
      state
    );
    if (!satisfied) {
      toRemove.push(placedId);
    }
  }

  // Remove invalid mutations
  for (const placedId of toRemove) {
    removeMutation(placedId, state);
    removedCount++;
  }

  return removedCount;
}

/**
 * Get count of mutations placed
 */
export function getMutationCount(state: OptimizerState): number {
  return state.placedMutations.size;
}

/**
 * Get count of crops placed
 */
export function getCropCount(state: OptimizerState): number {
  return state.placedCrops.size;
}

/**
 * Get list of all placed mutation IDs
 */
export function getPlacedMutationIds(state: OptimizerState): string[] {
  return Array.from(state.placedMutations.keys());
}

/**
 * Get random placed mutation
 */
export function getRandomPlacedMutation(state: OptimizerState): OptimizerPlacedMutation | null {
  const mutations = Array.from(state.placedMutations.values());
  if (mutations.length === 0) return null;
  return mutations[Math.floor(Math.random() * mutations.length)];
}

/**
 * Get all unlocked cells that are currently empty
 */
export function getEmptyUnlockedCells(
  state: OptimizerState,
  unlockedSlots: Set<string>
): Position[] {
  const cells: Position[] = [];

  for (const slot of unlockedSlots) {
    const [y, x] = slot.split(',').map(Number);
    if (state.grid[y]?.[x] === null) {
      cells.push({ x, y });
    }
  }

  return cells;
}

/**
 * Shuffle an array in place (Fisher-Yates)
 */
export function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

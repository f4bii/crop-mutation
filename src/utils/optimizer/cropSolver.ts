import type { Position, OptimizerState, MutationConditions } from '@types';
import { getMutationData, MUTATIONS_DATA } from '@data/mutationsData';
import { getGeometryCached, getAdjacentCells, isInBounds, getOccupiedCells } from './geometry';

/**
 * Extract required crops/mutations from conditions (excluding special rules)
 */
export function extractRequirements(conditions: MutationConditions): {
  crops: Map<string, number>;
  mutations: Map<string, number>;
  adjacentCrops: number | null;
  special: string | null;
} {
  const crops = new Map<string, number>();
  const mutations = new Map<string, number>();
  let adjacentCrops: number | null = null;
  let special: string | null = null;

  for (const [key, value] of Object.entries(conditions)) {
    if (key === 'special') {
      special = value as string;
    } else if (key === 'adjacent_crops') {
      adjacentCrops = value as number;
    } else if (typeof value === 'number') {
      // Check if this is a mutation or a crop
      if (MUTATIONS_DATA[key]) {
        mutations.set(key, value);
      } else {
        crops.set(key, value);
      }
    }
  }

  return { crops, mutations, adjacentCrops, special };
}

/**
 * Get what's currently adjacent to a mutation position in the state
 */
export function getAdjacentContents(
  position: Position,
  mutationId: string,
  state: OptimizerState
): {
  adjacentCrops: Map<string, Position[]>;
  adjacentMutations: Map<string, string[]>;
  totalAdjacentCrops: number;
} {
  const geometry = getGeometryCached(mutationId);
  const adjacentCells = getAdjacentCells(position, geometry);
  const adjacentCrops = new Map<string, Position[]>();
  const adjacentMutations = new Map<string, string[]>();
  let totalAdjacentCrops = 0;

  for (const cell of adjacentCells) {
    if (!isInBounds(cell)) continue;

    const cellContent = state.grid[cell.y]?.[cell.x];
    if (!cellContent) continue;

    // Check if it's a crop
    const placedCrop = state.placedCrops.get(cellContent);
    if (placedCrop) {
      const cropType = placedCrop.crop;
      if (!adjacentCrops.has(cropType)) {
        adjacentCrops.set(cropType, []);
      }
      adjacentCrops.get(cropType)!.push(cell);
      totalAdjacentCrops++;
      continue;
    }

    // Check if it's a mutation
    for (const [placedId, placedMutation] of state.placedMutations) {
      const occupiedCells = getOccupiedCells(placedMutation.position, placedMutation.geometry);
      if (occupiedCells.some(c => c.x === cell.x && c.y === cell.y)) {
        const mutationType = placedMutation.mutationId;
        if (!adjacentMutations.has(mutationType)) {
          adjacentMutations.set(mutationType, []);
        }
        // Only add unique placed IDs
        if (!adjacentMutations.get(mutationType)!.includes(placedId)) {
          adjacentMutations.get(mutationType)!.push(placedId);
        }
        break;
      }
    }
  }

  return { adjacentCrops, adjacentMutations, totalAdjacentCrops };
}

/**
 * Check if a mutation's conditions are CURRENTLY satisfied at its position
 * This is used to validate placed mutations
 */
export function areConditionsSatisfied(
  mutationId: string,
  position: Position,
  state: OptimizerState
): { satisfied: boolean; reason?: string } {
  const mutation = getMutationData(mutationId);
  if (!mutation) return { satisfied: false, reason: 'Unknown mutation' };

  const { crops, mutations, adjacentCrops, special } = extractRequirements(mutation.conditions);

  // Special conditions cannot be satisfied by the optimizer
  if (special) {
    return { satisfied: false, reason: `Special condition: ${special}` };
  }

  const { adjacentCrops: existingCrops, adjacentMutations: existingMutations, totalAdjacentCrops } =
    getAdjacentContents(position, mutationId, state);

  // Check adjacent_crops === 0 (Lonelily) - must have NO adjacent crops
  if (adjacentCrops === 0) {
    if (totalAdjacentCrops > 0) {
      return { satisfied: false, reason: 'Requires no adjacent crops (Lonelily)' };
    }
    // Lonelily has no other requirements
    return { satisfied: true };
  }

  // Check crop requirements
  for (const [cropType, needed] of crops) {
    const existing = existingCrops.get(cropType)?.length || 0;
    if (existing < needed) {
      return { satisfied: false, reason: `Needs ${needed} ${cropType}, has ${existing}` };
    }
  }

  // Check mutation requirements
  for (const [mutationType, needed] of mutations) {
    const existing = existingMutations.get(mutationType)?.length || 0;
    if (existing < needed) {
      return { satisfied: false, reason: `Needs ${needed} ${mutationType}, has ${existing}` };
    }
  }

  return { satisfied: true };
}

/**
 * Check if a mutation CAN have its conditions satisfied at a position
 * This checks if there's enough space for required crops
 */
export function canSatisfyConditions(
  mutationId: string,
  position: Position,
  state: OptimizerState,
  unlockedSlots: Set<string>
): boolean {
  const mutation = getMutationData(mutationId);
  if (!mutation) return false;

  const { crops, mutations, adjacentCrops, special } = extractRequirements(mutation.conditions);

  // Skip special conditions (Godseed, Shellfruit, Jerryflower)
  if (special) return false;

  // For Lonelily (adjacent_crops === 0), check no crops are adjacent
  if (adjacentCrops === 0) {
    const { totalAdjacentCrops } = getAdjacentContents(position, mutationId, state);
    return totalAdjacentCrops === 0;
  }

  // If mutation requires other mutations, check if they're adjacent
  if (mutations.size > 0) {
    const { adjacentMutations: existingMutations } = getAdjacentContents(position, mutationId, state);
    for (const [mutationType, needed] of mutations) {
      const existing = existingMutations.get(mutationType)?.length || 0;
      if (existing < needed) {
        // Required mutations not adjacent - can't satisfy
        return false;
      }
    }
  }

  // Check if we have enough adjacent unlocked empty cells for crops
  const geometry = getGeometryCached(mutationId);
  const adjacentCells = getAdjacentCells(position, geometry).filter(cell =>
    isInBounds(cell) && unlockedSlots.has(`${cell.y},${cell.x}`)
  );

  // Get already satisfied crop requirements
  const { adjacentCrops: existingCrops } = getAdjacentContents(position, mutationId, state);

  // Calculate remaining crops needed
  let remainingCropsNeeded = 0;
  for (const [cropType, needed] of crops) {
    const existing = existingCrops.get(cropType)?.length || 0;
    remainingCropsNeeded += Math.max(0, needed - existing);
  }

  // Count empty adjacent cells
  const emptyAdjacentCells = adjacentCells.filter(cell => {
    const content = state.grid[cell.y]?.[cell.x];
    return content === null;
  });

  return emptyAdjacentCells.length >= remainingCropsNeeded;
}

/**
 * Get the crops needed to satisfy a mutation's conditions
 */
export function getRequiredCrops(mutationId: string): Map<string, number> {
  const mutation = getMutationData(mutationId);
  if (!mutation) return new Map();

  const { crops } = extractRequirements(mutation.conditions);
  return crops;
}

/**
 * Get the mutations needed to satisfy a mutation's conditions
 */
export function getRequiredMutations(mutationId: string): Map<string, number> {
  const mutation = getMutationData(mutationId);
  if (!mutation) return new Map();

  const { mutations } = extractRequirements(mutation.conditions);
  return mutations;
}

/**
 * Check if a mutation needs isolation (no adjacent crops)
 */
export function needsIsolation(mutationId: string): boolean {
  const mutation = getMutationData(mutationId);
  if (!mutation) return false;

  return mutation.conditions.adjacent_crops === 0;
}

/**
 * Check if a mutation has special conditions that can't be auto-satisfied
 */
export function hasSpecialConditions(mutationId: string): boolean {
  const mutation = getMutationData(mutationId);
  if (!mutation) return false;

  return mutation.conditions.special !== undefined;
}

/**
 * Find positions to place crops to satisfy a mutation's requirements
 * Returns null if requirements cannot be satisfied
 */
export function findCropPlacements(
  mutationId: string,
  mutationPosition: Position,
  state: OptimizerState,
  unlockedSlots: Set<string>
): Map<string, Position[]> | null {
  const requiredCrops = getRequiredCrops(mutationId);
  const placements = new Map<string, Position[]>();

  if (requiredCrops.size === 0) return placements;

  const geometry = getGeometryCached(mutationId);
  const adjacentCells = getAdjacentCells(mutationPosition, geometry)
    .filter(cell => isInBounds(cell) && unlockedSlots.has(`${cell.y},${cell.x}`));

  // Get existing crops that can satisfy requirements
  const { adjacentCrops: existingCrops } = getAdjacentContents(mutationPosition, mutationId, state);

  // Track remaining requirements
  const remaining = new Map<string, number>();
  for (const [cropType, needed] of requiredCrops) {
    const existing = existingCrops.get(cropType)?.length || 0;
    const stillNeeded = Math.max(0, needed - existing);
    remaining.set(cropType, stillNeeded);

    // Add existing crop positions to placements
    if (existing > 0) {
      placements.set(cropType, existingCrops.get(cropType)!.slice(0, needed));
    }
  }

  // Find empty cells for remaining crops
  const emptyCells = adjacentCells.filter(cell => state.grid[cell.y]?.[cell.x] === null);

  let cellIndex = 0;
  for (const [cropType, needed] of remaining) {
    if (needed <= 0) continue;

    const positions: Position[] = placements.get(cropType) || [];
    for (let i = 0; i < needed; i++) {
      if (cellIndex >= emptyCells.length) {
        // Not enough empty cells - can't satisfy
        return null;
      }
      positions.push(emptyCells[cellIndex]);
      cellIndex++;
    }
    placements.set(cropType, positions);
  }

  return placements;
}

/**
 * Check if placing a crop at a position would violate any isolation rules
 */
export function wouldViolateIsolation(
  position: Position,
  state: OptimizerState
): boolean {
  // Check all placed mutations that need isolation
  for (const [, placedMutation] of state.placedMutations) {
    if (!needsIsolation(placedMutation.mutationId)) continue;

    const adjacentCells = getAdjacentCells(placedMutation.position, placedMutation.geometry);
    if (adjacentCells.some(cell => cell.x === position.x && cell.y === position.y)) {
      return true; // This would place a crop adjacent to an isolated mutation
    }
  }

  return false;
}

/**
 * Validate all mutations in a state and return invalid ones
 */
export function findInvalidMutations(state: OptimizerState): string[] {
  const invalidIds: string[] = [];

  for (const [placedId, placedMutation] of state.placedMutations) {
    const { satisfied } = areConditionsSatisfied(
      placedMutation.mutationId,
      placedMutation.position,
      state
    );
    if (!satisfied) {
      invalidIds.push(placedId);
    }
  }

  return invalidIds;
}

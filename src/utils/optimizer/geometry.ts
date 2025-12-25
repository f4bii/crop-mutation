import type { Position, FootprintOffset, MutationGeometry, GroundType } from '@types';
import { getMutationData, MUTATIONS_DATA } from '@data/mutationsData';
import { CROP_GROUND_REQUIREMENTS } from '@data/constants';

/**
 * Parse mutation size string (e.g., "1x1", "2x2", "3x3") to dimensions
 */
export function parseSize(size: string): { width: number; height: number } {
  const [w, h] = size.split('x').map(Number);
  return { width: w || 1, height: h || 1 };
}

/**
 * Precompute footprint offsets for a mutation of given size
 * For a 2x2 mutation at position (x, y), the footprint is:
 *   (x, y), (x+1, y), (x, y+1), (x+1, y+1)
 */
export function computeFootprint(width: number, height: number): FootprintOffset[] {
  const offsets: FootprintOffset[] = [];
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      offsets.push({ dx, dy });
    }
  }
  return offsets;
}

/**
 * Compute adjacency ring (cells adjacent to the mutation footprint)
 * These are the cells where crops/mutations can satisfy conditions
 */
export function computeAdjacencyRing(width: number, height: number): FootprintOffset[] {
  const footprintSet = new Set<string>();
  const adjacencySet = new Set<string>();

  // Build footprint set for quick lookup
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      footprintSet.add(`${dx},${dy}`);
    }
  }

  // For each footprint cell, check all 8 neighbors
  const directions = [
    [-1, -1], [-1, 0], [-1, 1],
    [0, -1],           [0, 1],
    [1, -1],  [1, 0],  [1, 1]
  ];

  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      for (const [ddx, ddy] of directions) {
        const nx = dx + ddx;
        const ny = dy + ddy;
        const key = `${nx},${ny}`;
        if (!footprintSet.has(key)) {
          adjacencySet.add(key);
        }
      }
    }
  }

  return Array.from(adjacencySet).map(key => {
    const [dx, dy] = key.split(',').map(Number);
    return { dx, dy };
  });
}

/**
 * Get complete geometry data for a mutation
 */
export function getMutationGeometry(mutationId: string): MutationGeometry {
  const mutation = getMutationData(mutationId);
  if (!mutation) {
    return { width: 1, height: 1, footprint: [{ dx: 0, dy: 0 }], adjacencyRing: computeAdjacencyRing(1, 1) };
  }

  const { width, height } = parseSize(mutation.size);
  return {
    width,
    height,
    footprint: computeFootprint(width, height),
    adjacencyRing: computeAdjacencyRing(width, height)
  };
}

// Pre-computed geometry cache for all mutations
const geometryCache = new Map<string, MutationGeometry>();

export function getGeometryCached(mutationId: string): MutationGeometry {
  if (!geometryCache.has(mutationId)) {
    geometryCache.set(mutationId, getMutationGeometry(mutationId));
  }
  return geometryCache.get(mutationId)!;
}

// Initialize cache
Object.keys(MUTATIONS_DATA).forEach(id => getGeometryCached(id));

/**
 * Get all cells occupied by a mutation at a given position
 */
export function getOccupiedCells(position: Position, geometry: MutationGeometry): Position[] {
  return geometry.footprint.map(offset => ({
    x: position.x + offset.dx,
    y: position.y + offset.dy
  }));
}

/**
 * Get all adjacent cells for a mutation at a given position
 */
export function getAdjacentCells(position: Position, geometry: MutationGeometry): Position[] {
  return geometry.adjacencyRing.map(offset => ({
    x: position.x + offset.dx,
    y: position.y + offset.dy
  }));
}

/**
 * Check if a position is within grid bounds
 */
export function isInBounds(position: Position, gridSize: number = 10): boolean {
  return position.x >= 0 && position.x < gridSize && position.y >= 0 && position.y < gridSize;
}

/**
 * Check if all footprint cells are within bounds
 */
export function canFitInGrid(position: Position, geometry: MutationGeometry, gridSize: number = 10): boolean {
  return getOccupiedCells(position, geometry).every(cell => isInBounds(cell, gridSize));
}

/**
 * Check if all footprint cells are in unlocked slots
 */
export function canFitInUnlockedSlots(
  position: Position,
  geometry: MutationGeometry,
  unlockedSlots: Set<string>
): boolean {
  return getOccupiedCells(position, geometry).every(cell =>
    unlockedSlots.has(`${cell.y},${cell.x}`)
  );
}

/**
 * Check ground type compatibility
 */
export function checkGroundCompatibility(
  mutationGround: GroundType,
  cellGroundType: GroundType
): boolean {
  if (mutationGround === 'any') return true;
  return mutationGround === cellGroundType;
}

/**
 * Check if a crop can be placed on a given ground type
 */
export function canPlaceCropOnGround(crop: string, groundType: GroundType): boolean {
  const cropGround = CROP_GROUND_REQUIREMENTS[crop as keyof typeof CROP_GROUND_REQUIREMENTS];
  if (!cropGround) return true; // Unknown crops default to any
  if (cropGround === 'any') return true;
  return cropGround === groundType;
}

/**
 * Get mutations grouped by size for efficient swap operations
 */
export function getMutationsBySize(): Map<string, string[]> {
  const bySize = new Map<string, string[]>();

  Object.entries(MUTATIONS_DATA).forEach(([id, mutation]) => {
    const size = mutation.size;
    if (!bySize.has(size)) {
      bySize.set(size, []);
    }
    bySize.get(size)!.push(id);
  });

  return bySize;
}

export const MUTATIONS_BY_SIZE = getMutationsBySize();

// Core geometry utilities
export {
  parseSize,
  computeFootprint,
  computeAdjacencyRing,
  getMutationGeometry,
  getGeometryCached,
  getOccupiedCells,
  getAdjacentCells,
  isInBounds,
  canFitInGrid,
  canFitInUnlockedSlots,
  checkGroundCompatibility,
  canPlaceCropOnGround,
  getMutationsBySize,
  MUTATIONS_BY_SIZE
} from './geometry';

// Crop satisfaction solver
export {
  extractRequirements,
  getAdjacentContents,
  canSatisfyConditions,
  areConditionsSatisfied,
  getRequiredCrops,
  getRequiredMutations,
  needsIsolation,
  hasSpecialConditions,
  findCropPlacements,
  wouldViolateIsolation,
  findInvalidMutations
} from './cropSolver';

// State management
export {
  createEmptyState,
  deepCloneState,
  isCellOccupied,
  canPlaceMutation,
  placeMutation,
  placeMutationWithCrops,
  removeMutation,
  placeCrop,
  placeRequiredCrops,
  validateAndCleanState,
  getMutationCount,
  getCropCount,
  getPlacedMutationIds,
  getRandomPlacedMutation,
  getEmptyUnlockedCells,
  shuffleArray
} from './stateManager';

// Scoring functions
export {
  calculateMutationsScore,
  calculateProfitScore,
  calculateScore,
  getScoreBreakdown
} from './scoring';

// Annealing engine
export {
  optimizeLayout,
  DEFAULT_CONFIG,
  QUICK_CONFIG,
  THOROUGH_CONFIG
} from './annealingEngine';

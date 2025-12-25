// Base crop and condition types
export type BaseCrop = 'wheat' | 'potato' | 'carrot' | 'pumpkin' | 'melon' | 'cocoa_beans' |
  'sugar_cane' | 'cactus' | 'nether_wart' | 'red_mushroom' | 'brown_mushroom' |
  'moonflower' | 'sunflower' | 'wild_rose';

export type ExtraCondition = 'fire' | 'dead_plant' | 'fermento';

export type Crop = BaseCrop | ExtraCondition;

export type GroundType = 'farmland' | 'soul_sand' | 'mycelium' | 'sand' | 'end_stone' | 'any';

export interface MutationConditions {
  special?: string;
  adjacent_crops?: number;
  [key: string]: number | string | undefined;
}

export interface MutationData {
  name: string;
  size: string;
  ground: GroundType;
  drops: { [key: string]: number } | null;
  effects: string[];
  conditions: MutationConditions;
}

export type MutationsData = Record<string, MutationData>;

export type MutationTiers = Record<string, number>;

export type CropEmojis = Record<ExtraCondition, string> & { [key: string]: string };

export type CropGroundRequirements = Record<Crop, GroundType> & { [key: string]: GroundType };

export interface TierColor {
  bg: string;
  border: string;
  glow: string;
}

export interface MutationAreaCell {
  type: 'mutation_area';
  mutationId: string;
  isCenter: boolean;
  needsIsolation: boolean;
}

export interface CropCell {
  type: 'crop';
  crop: string;
  forMutation: string;
  forMutations?: string[];
}

export interface EmptyZoneCell {
  type: 'empty_zone';
  forMutation: string;
}

export type GridCell = MutationAreaCell | CropCell | EmptyZoneCell | null;

export type Grid = GridCell[][];

export interface PlacedMutation {
  id: string;
  name: string;
  position: {
    x: number;
    y: number;
    adjacentCells?: Array<{ x: number; y: number }>;
    adjacentMutations?: Map<string, string>;
    adjacentExistingCrops?: Map<string, string>;
    conditionsSatisfiedByMutations?: Map<string, number>;
    conditionsSatisfiedByCrops?: Map<string, number>;
    // Godseed-specific fields
    coveredEffects?: number;
    missingEffects?: string[];
    adjacentEffects?: Set<string>;
  };
  size: string;
  conditions: MutationConditions;
  needsIsolation: boolean;
  usedMutations?: string[];
  sharedCrops?: string[];
}

export interface OptimizedLayout {
  grid: Grid;
  mutations: PlacedMutation[];
  unlockedSlots: Set<string>;
}

export interface GroupedMutationsByTier {
  [tier: number]: Array<MutationData & { id: string }>;
}

export type AvailableMutations = Record<string, MutationData>;

export interface CustomDesignCell {
  type: 'empty' | 'locked' | 'mutation' | 'crop';
  mutationId?: string;
  cropType?: string;
}

export type CustomDesignGrid = CustomDesignCell[][];

// ============================================
// Optimizer Types
// ============================================

export type ObjectiveType = 'MAX_MUTATIONS' | 'MAX_PROFIT';

export type MoveType = 'ADD_MUTATION' | 'REMOVE_MUTATION' | 'MOVE_MUTATION' | 'SWAP_MUTATION';

export interface Position {
  x: number;
  y: number;
}

export interface FootprintOffset {
  dx: number;
  dy: number;
}

export interface MutationGeometry {
  width: number;
  height: number;
  footprint: FootprintOffset[];
  adjacencyRing: FootprintOffset[];
}

export interface OptimizerPlacedMutation {
  id: string;
  mutationId: string;
  position: Position;
  geometry: MutationGeometry;
  satisfyingCrops: Map<string, Position[]>;
  satisfyingMutations: Map<string, string[]>;
}

export interface OptimizerPlacedCrop {
  id: string;
  crop: string;
  position: Position;
  forMutations: string[];
}

export interface OptimizerState {
  grid: (string | null)[][];
  placedMutations: Map<string, OptimizerPlacedMutation>;
  placedCrops: Map<string, OptimizerPlacedCrop>;
  score: number;
}

export interface OptimizerConfig {
  maxIterations: number;
  startTemperature: number;
  coolingRate: number;
  objectiveType: ObjectiveType;
}

export interface OptimizerResult {
  state: OptimizerState;
  iterations: number;
  finalScore: number;
  bestScore: number;
  history: { iteration: number; score: number; temperature: number }[];
}

export interface OptimizerProgress {
  iteration: number;
  maxIterations: number;
  currentScore: number;
  bestScore: number;
  temperature: number;
  placedMutationsCount: number;
}

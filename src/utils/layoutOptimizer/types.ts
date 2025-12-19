export interface Position {
    x: number;
    y: number;
}

// Parsed conditions - no more stringly-typed keys
export interface ParsedConditions {
    crops: Map<string, number>;      // cropType -> count required
    mutations: Map<string, number>;  // mutationId -> count required
    requiresIsolation: boolean;
}

// Mutation with pre-parsed conditions
export interface ParsedMutation {
    id: string;
    name: string;
    size: [number, number];  // [width, height]
    conditions: ParsedConditions;
    effects: string[];
}

// Feasibility result - separate from scoring
export interface FeasiblePlacement {
    position: Position;
    freeCells: Position[];
    satisfiedCrops: Map<string, Position[]>;
    satisfiedMutations: Map<string, Position[]>;
    cropsNeeded: Map<string, number>;  // What still needs to be placed
}

// Strategy weights - data-driven instead of if/else
export interface StrategyProfile {
    name: string;
    sharingWeight: number;
    compactnessWeight: number;
    synergyWeight: number;
    cornerWeight: number;
    randomness: number;  // 0-1, how much to randomize selection
}

// Incremental fitness state
export interface FitnessState {
    mutationCount: number;
    targetCount: number;
    sharedCropCount: number;
    totalCrops: number;
    totalDistance: number;
    distancePairs: number;
    synergyCount: number;
}

// Score breakdown for comparison
export interface ScoreBreakdown {
    mutationsPlaced: number;
    mutationsRequested: number;
    placementRate: number;
    totalCropsUsed: number;
    sharedCrops: number;
    cropEfficiency: number;
    compactnessScore: number;
    synergiesFound: number;
    totalScore: number;
}

export interface MutationPlacement {
    mutationId: string;
    instanceId: string;
    position: Position;
    size: [number, number];
    crops: Array<{ position: Position; cropType: string }>;
    needsIsolation: boolean;
}

// Move for simulated annealing
export interface Move {
    remove: string;  // instanceId to remove
    newPosition: FeasiblePlacement;
    mutation: ParsedMutation;
}

// Re-export everything from the modular implementation
export {
    optimizeLayout,
    optimizeLayoutWithScore,
    optimizeLayoutAllStrategies,
} from './layoutOptimizer/index';

export type {
    OptimizedLayoutWithScore,
    ScoreBreakdown,
} from './layoutOptimizer/index';

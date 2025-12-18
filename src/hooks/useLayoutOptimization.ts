import { useState, useCallback } from 'react';
import { optimizeLayout as optimizeLayoutUtil } from '@utils/layoutOptimizer';
import type {TargetMutations, OptimizedLayout, AvailableMutations} from '@types';

export function useLayoutOptimization() {
    const [optimizedLayout, setOptimizedLayout] = useState<OptimizedLayout | null>(null);
    const [isOptimizing, setIsOptimizing] = useState(false);

    const optimizeLayout = useCallback((unlockedMutations: AvailableMutations, targetMutations: TargetMutations, unlockedSlots: Set<string>) => {
        setIsOptimizing(true);

        setTimeout(() => {
            const result = optimizeLayoutUtil(unlockedMutations, targetMutations, unlockedSlots);
            setOptimizedLayout(result);
            setIsOptimizing(false);
        }, 100);
    }, []);

    return {
        optimizedLayout,
        isOptimizing,
        optimizeLayout
    };
}

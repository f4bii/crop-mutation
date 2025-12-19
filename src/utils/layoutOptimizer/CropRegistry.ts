import { cellKey, parseKey } from './utils';
import type { Position } from './types';

export class CropRegistry {
    private crops = new Map<string, { type: string; mutations: Set<string> }>();

    clone(): CropRegistry {
        const cloned = new CropRegistry();
        for (const [key, val] of this.crops) {
            cloned.crops.set(key, { type: val.type, mutations: new Set(val.mutations) });
        }
        return cloned;
    }

    getCrop(x: number, y: number): { type: string; mutations: Set<string> } | undefined {
        return this.crops.get(cellKey(x, y));
    }

    hasCrop(x: number, y: number): boolean {
        return this.crops.has(cellKey(x, y));
    }

    placeCrop(x: number, y: number, type: string, forMutation: string): void {
        const key = cellKey(x, y);
        const existing = this.crops.get(key);
        if (existing) {
            existing.mutations.add(forMutation);
        } else {
            this.crops.set(key, { type, mutations: new Set([forMutation]) });
        }
    }

    removeMutationFromCrops(mutationId: string): Position[] {
        const released: Position[] = [];
        for (const [key, crop] of this.crops) {
            crop.mutations.delete(mutationId);
            if (crop.mutations.size === 0) {
                this.crops.delete(key);
                released.push(parseKey(key));
            }
        }
        return released;
    }

    getSharedCount(): number {
        let count = 0;
        for (const crop of this.crops.values()) {
            if (crop.mutations.size > 1) count++;
        }
        return count;
    }

    getTotalCount(): number {
        return this.crops.size;
    }

    getAllCrops(): Map<string, { type: string; mutations: Set<string> }> {
        return this.crops;
    }
}

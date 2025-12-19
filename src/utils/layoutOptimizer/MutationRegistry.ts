import { cellKey } from './utils';
import type { MutationPlacement } from './types';

export class MutationRegistry {
    private mutations = new Map<string, MutationPlacement>();
    private cellToMutation = new Map<string, string>();  // cell -> instanceId

    clone(): MutationRegistry {
        const cloned = new MutationRegistry();
        for (const [id, p] of this.mutations) {
            cloned.mutations.set(id, { ...p, crops: [...p.crops] });
        }
        cloned.cellToMutation = new Map(this.cellToMutation);
        return cloned;
    }

    getMutationIdAt(x: number, y: number): string | undefined {
        const instanceId = this.cellToMutation.get(cellKey(x, y));
        if (!instanceId) return undefined;
        return instanceId.split('_')[0];
    }

    getPlacement(instanceId: string): MutationPlacement | undefined {
        return this.mutations.get(instanceId);
    }

    place(placement: MutationPlacement): void {
        this.mutations.set(placement.instanceId, placement);
        const [w, h] = placement.size;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                this.cellToMutation.set(cellKey(placement.position.x + dx, placement.position.y + dy), placement.instanceId);
            }
        }
    }

    remove(instanceId: string): MutationPlacement | undefined {
        const placement = this.mutations.get(instanceId);
        if (!placement) return undefined;

        this.mutations.delete(instanceId);
        const [w, h] = placement.size;
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                this.cellToMutation.delete(cellKey(placement.position.x + dx, placement.position.y + dy));
            }
        }
        return placement;
    }

    getAll(): MutationPlacement[] {
        return Array.from(this.mutations.values());
    }
}

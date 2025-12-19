import { Grid } from './Grid';
import { CropRegistry } from './CropRegistry';
import { MutationRegistry } from './MutationRegistry';
import { cellKey } from './utils';
import { GRID_SIZE } from './constants';

export class PlacementContext {
    grid: Grid;
    crops: CropRegistry;
    mutations: MutationRegistry;
    emptyZones: Set<string>;  // Reserved empty cells for isolation

    constructor(unlockedSlots: Set<string>) {
        this.grid = new Grid(unlockedSlots);
        this.crops = new CropRegistry();
        this.mutations = new MutationRegistry();
        this.emptyZones = new Set();
    }

    clone(): PlacementContext {
        const cloned = new PlacementContext(new Set());
        cloned.grid = this.grid.clone();
        cloned.crops = this.crops.clone();
        cloned.mutations = this.mutations.clone();
        cloned.emptyZones = new Set(this.emptyZones);
        return cloned;
    }

    isCellFreeForCrop(x: number, y: number): boolean {
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
        const key = cellKey(x, y);
        return this.grid.isFree(x, y) && !this.emptyZones.has(key) && !this.crops.hasCrop(x, y);
    }

    markEmptyZone(x: number, y: number): void {
        if (this.grid.isUnlocked(x, y)) {
            this.emptyZones.add(cellKey(x, y));
        }
    }
}

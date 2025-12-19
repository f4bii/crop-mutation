import { cellKey } from './utils';
import { GRID_SIZE } from './constants';

export class Grid {
    private occupied = new Set<string>();
    private readonly unlockedSlots: Set<string>;

    constructor(unlockedSlots: Set<string>) {
        this.unlockedSlots = unlockedSlots;
    }

    clone(): Grid {
        const cloned = new Grid(this.unlockedSlots);
        cloned.occupied = new Set(this.occupied);
        return cloned;
    }

    isUnlocked(x: number, y: number): boolean {
        return this.unlockedSlots.has(cellKey(x, y));
    }

    isFree(x: number, y: number): boolean {
        if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return false;
        const key = cellKey(x, y);
        return this.unlockedSlots.has(key) && !this.occupied.has(key);
    }

    occupy(x: number, y: number): void {
        this.occupied.add(cellKey(x, y));
    }

    release(x: number, y: number): void {
        this.occupied.delete(cellKey(x, y));
    }

    canFitRect(x: number, y: number, w: number, h: number): boolean {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                if (!this.isFree(x + dx, y + dy)) return false;
            }
        }
        return true;
    }

    occupyRect(x: number, y: number, w: number, h: number): void {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                this.occupy(x + dx, y + dy);
            }
        }
    }

    releaseRect(x: number, y: number, w: number, h: number): void {
        for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
                this.release(x + dx, y + dy);
            }
        }
    }
}

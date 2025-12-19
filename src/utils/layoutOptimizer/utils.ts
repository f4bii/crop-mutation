import type { Position } from './types';

export const cellKey = (x: number, y: number): string => `${x},${y}`;

export const parseKey = (key: string): Position => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
};

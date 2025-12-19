import React, { useState, useEffect, useCallback } from 'react';
import type { CustomDesignGrid } from '@types';

type SelectedItem = { type: 'mutation' | 'crop'; id: string } | null;
type DragMode = 'place' | 'remove' | null;

export function useDesignerDrag(
    grid: CustomDesignGrid,
    setGrid: React.Dispatch<React.SetStateAction<CustomDesignGrid>>,
    selectedItem: SelectedItem
) {
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState<DragMode>(null);

    const handleCellMouseDown = useCallback((row: number, col: number) => {
        const cell = grid[row]?.[col];
        if (!cell || cell.type === 'locked') return;

        setIsDragging(true);

        if (cell.type !== 'empty') {
            // Cell is occupied - drag to remove
            setDragMode('remove');
            setGrid(prev => {
                const newGrid = prev.map(r => r.map(c => ({ ...c })));
                newGrid[row][col] = { type: 'empty' };
                return newGrid;
            });
        } else if (selectedItem) {
            setDragMode('place');
            setGrid(prev => {
                const newGrid = prev.map(r => r.map(c => ({ ...c })));
                if (selectedItem.type === 'mutation') {
                    newGrid[row][col] = { type: 'mutation', mutationId: selectedItem.id };
                } else {
                    newGrid[row][col] = { type: 'crop', cropType: selectedItem.id };
                }
                return newGrid;
            });
        }
    }, [grid, selectedItem, setGrid]);

    const handleCellMouseEnter = useCallback((row: number, col: number) => {
        if (!isDragging || !dragMode) return;

        const cell = grid[row]?.[col];
        if (!cell || cell.type === 'locked') return;

        if (dragMode === 'remove' && cell.type !== 'empty') {
            setGrid(prev => {
                const newGrid = prev.map(r => r.map(c => ({ ...c })));
                newGrid[row][col] = { type: 'empty' };
                return newGrid;
            });
        } else if (dragMode === 'place' && cell.type === 'empty' && selectedItem) {
            setGrid(prev => {
                const newGrid = prev.map(r => r.map(c => ({ ...c })));
                if (selectedItem.type === 'mutation') {
                    newGrid[row][col] = { type: 'mutation', mutationId: selectedItem.id };
                } else {
                    newGrid[row][col] = { type: 'crop', cropType: selectedItem.id };
                }
                return newGrid;
            });
        }
    }, [isDragging, dragMode, grid, selectedItem, setGrid]);

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
        setDragMode(null);
    }, []);

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, [handleMouseUp]);

    return {
        isDragging,
        dragMode,
        handleCellMouseDown,
        handleCellMouseEnter
    };
}

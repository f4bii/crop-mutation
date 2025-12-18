import { useState, useEffect } from 'react';

export function useGridDrag(unlockedSlots: Set<string>, setUnlockedSlots: (slots: Set<string>) => void) {
    const [isDragging, setIsDragging] = useState(false);
    const [dragMode, setDragMode] = useState<'add' | 'remove' | null>(null);

    const handleSlotMouseDown = (x: number, y: number) => {
        const key = `${x},${y}`;
        setIsDragging(true);
        if (unlockedSlots.has(key)) {
            setDragMode('remove');
            const newSlots = new Set(unlockedSlots);
            newSlots.delete(key);
            setUnlockedSlots(newSlots);
        } else {
            setDragMode('add');
            const newSlots = new Set(unlockedSlots);
            newSlots.add(key);
            setUnlockedSlots(newSlots);
        }
    };

    const handleSlotMouseEnter = (x: number, y: number) => {
        if (!isDragging) return;
        const key = `${x},${y}`;
        const newSlots = new Set(unlockedSlots);
        if (dragMode === 'add') {
            newSlots.add(key);
        } else {
            newSlots.delete(key);
        }
        setUnlockedSlots(newSlots);
    };

    const handleMouseUp = () => {
        setIsDragging(false);
        setDragMode(null);
    };

    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    return {
        handleSlotMouseDown,
        handleSlotMouseEnter
    };
}

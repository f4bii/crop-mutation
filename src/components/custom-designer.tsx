import { useState, useMemo, useCallback } from "react"
import { Palette, Trash2, Sparkles, Info, MousePointer2 } from "lucide-react"
import { MUTATIONS_DATA } from "@/data/mutationsData"
import {BASE_CROPS, CROP_EMOJIS, EXTRA_CONDITIONS} from "@/data/constants"
import { allMutations } from "@/lib/mutation-data"
import { MutationIcon } from "@/components/icons/MutationIcon"
import { CropIcon } from "@/components/icons/CropIcon"
import { useDesignerDrag } from "@/hooks/useDesignerDrag"
import type { CustomDesignGrid, CustomDesignCell } from "@types"

const EFFECT_MULTIPLIERS = {
    improved_harvest_boost: 0.30,
    harvest_boost: 0.20,
    harvest_loss: -0.20,
} as const

const EFFECT_SPREAD_RADIUS = {
    none: 1,
    effect_spread: 2,
    improved_effect_spread: 3,
} as const

interface CellEffect {
    multiplier: number
    hasImmunity: boolean
    hasBonusDrops: boolean
    sources: Array<{ mutationId: string; effect: string; value: number }>
}

interface CustomDesignerProps {
    unlockedSlots: boolean[][]
}

function getMutationsByTier(): Record<number, typeof allMutations> {
    const grouped: Record<number, typeof allMutations> = {}
    for (const mutation of allMutations) {
        const tier = mutation.tier
        if (!grouped[tier]) grouped[tier] = []
        grouped[tier].push(mutation)
    }
    return grouped
}

function getCellDistance(r1: number, c1: number, r2: number, c2: number): number {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2))
}

function calculateCellEffects(
    row: number,
    col: number,
    grid: CustomDesignGrid
): CellEffect {
    const effects: CellEffect = {
        multiplier: 1.0,
        hasImmunity: false,
        hasBonusDrops: false,
        sources: [],
    }

    const appliedEffects = new Set<string>()

    const mutationsInRange: Array<{ mutationId: string; effects: string[]; distance: number }> = []

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            const cell = grid[r][c]
            if (cell.type !== 'mutation' || !cell.mutationId) continue

            const mutationData = MUTATIONS_DATA[cell.mutationId]
            if (!mutationData) continue

            let spreadRadius: 1 | 2 | 3 = EFFECT_SPREAD_RADIUS.none
            if (mutationData.effects.includes('improved_effect_spread')) {
                spreadRadius = EFFECT_SPREAD_RADIUS.improved_effect_spread
            } else if (mutationData.effects.includes('effect_spread')) {
                spreadRadius = EFFECT_SPREAD_RADIUS.effect_spread
            }

            const distance = getCellDistance(row, col, r, c)

            if (distance <= spreadRadius) {
                mutationsInRange.push({
                    mutationId: cell.mutationId,
                    effects: mutationData.effects,
                    distance
                })
            }
        }
    }

    mutationsInRange.sort((a, b) => a.distance - b.distance)

    for (const { mutationId, effects: mutEffects } of mutationsInRange) {
        if (mutEffects.includes('immunity') && !appliedEffects.has('immunity')) {
            effects.hasImmunity = true
            effects.sources.push({ mutationId, effect: 'immunity', value: 0 })
            appliedEffects.add('immunity')
        }
    }

    for (const { mutationId, effects: mutEffects } of mutationsInRange) {
        for (const effect of mutEffects) {
            if (appliedEffects.has(effect)) continue

            if (effect === 'improved_harvest_boost') {
                effects.multiplier += EFFECT_MULTIPLIERS.improved_harvest_boost
                effects.sources.push({ mutationId, effect, value: EFFECT_MULTIPLIERS.improved_harvest_boost })
                appliedEffects.add(effect)
            } else if (effect === 'harvest_boost') {
                effects.multiplier += EFFECT_MULTIPLIERS.harvest_boost
                effects.sources.push({ mutationId, effect, value: EFFECT_MULTIPLIERS.harvest_boost })
                appliedEffects.add(effect)
            } else if (effect === 'harvest_loss' && !effects.hasImmunity) {
                effects.multiplier += EFFECT_MULTIPLIERS.harvest_loss
                effects.sources.push({ mutationId, effect, value: EFFECT_MULTIPLIERS.harvest_loss })
                appliedEffects.add(effect)
            } else if (effect === 'bonus_drops') {
                effects.hasBonusDrops = true
                effects.sources.push({ mutationId, effect, value: 0 })
                appliedEffects.add(effect)
            }
        }
    }

    effects.multiplier = Math.max(0, effects.multiplier)
    return effects
}

function getMutationEffectRadius(mutationId: string): number {
    const mutationData = MUTATIONS_DATA[mutationId]
    if (!mutationData) return 1

    if (mutationData.effects.includes('improved_effect_spread')) {
        return EFFECT_SPREAD_RADIUS.improved_effect_spread
    } else if (mutationData.effects.includes('effect_spread')) {
        return EFFECT_SPREAD_RADIUS.effect_spread
    }
    return EFFECT_SPREAD_RADIUS.none
}

function createEmptyGrid(unlockedSlots: boolean[][]): CustomDesignGrid {
    const grid: CustomDesignGrid = []
    for (let row = 0; row < 10; row++) {
        const rowCells: CustomDesignCell[] = []
        for (let col = 0; col < 10; col++) {
            rowCells.push({
                type: unlockedSlots[row]?.[col] ? 'empty' : 'locked'
            })
        }
        grid.push(rowCells)
    }
    return grid
}

export function CustomDesigner({ unlockedSlots }: CustomDesignerProps) {
    const [grid, setGrid] = useState<CustomDesignGrid>(() => createEmptyGrid(unlockedSlots))
    const [selectedItem, setSelectedItem] = useState<{ type: 'mutation' | 'crop'; id: string } | null>(null)
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)
    const [showEffects, setShowEffects] = useState(true)
    const [paletteTab, setPaletteTab] = useState<'mutations' | 'crops'>('mutations')

    const { handleCellMouseDown, handleCellMouseEnter } = useDesignerDrag(grid, setGrid, selectedItem)

    const mutationsByTier = useMemo(() => getMutationsByTier(), [])
    const tierNumbers = useMemo(() => Object.keys(mutationsByTier).map(Number).sort((a, b) => a - b), [mutationsByTier])

    const isInHoveredRange = useCallback((row: number, col: number): boolean => {
        if (!hoveredCell) return false
        const hoveredCellData = grid[hoveredCell.row]?.[hoveredCell.col]
        if (hoveredCellData?.type !== 'mutation' || !hoveredCellData.mutationId) return false

        const radius = getMutationEffectRadius(hoveredCellData.mutationId)
        const distance = getCellDistance(row, col, hoveredCell.row, hoveredCell.col)
        return distance <= radius && distance > 0
    }, [hoveredCell, grid])

    const handleCellRightClick = useCallback((e: React.MouseEvent, row: number, col: number) => {
        e.preventDefault()
        const cell = grid[row][col]

        if (cell.type === 'locked') return

        setGrid(prev => {
            const newGrid = prev.map(r => r.map(c => ({ ...c })))
            newGrid[row][col] = { type: 'empty' }
            return newGrid
        })
    }, [grid])

    const clearGrid = useCallback(() => {
        setGrid(createEmptyGrid(unlockedSlots))
    }, [unlockedSlots])

    const placedCounts = useMemo(() => {
        let mutations = 0
        let crops = 0
        for (const row of grid) {
            for (const cell of row) {
                if (cell.type === 'mutation') mutations++
                if (cell.type === 'crop') crops++
            }
        }
        return { mutations, crops, total: mutations + crops }
    }, [grid])

    const getMultiplierColor = (multiplier: number) => {
        if (multiplier >= 1.5) return 'text-green-400'
        if (multiplier >= 1.2) return 'text-emerald-400'
        if (multiplier >= 1.0) return 'text-foreground'
        if (multiplier >= 0.8) return 'text-orange-400'
        return 'text-red-400'
    }

    const getMultiplierBg = (multiplier: number) => {
        if (multiplier >= 1.5) return 'bg-green-500/20 border-green-500/50'
        if (multiplier >= 1.2) return 'bg-emerald-500/20 border-emerald-500/50'
        if (multiplier >= 1.0) return 'bg-blue-500/20 border-blue-500/50'
        if (multiplier >= 0.8) return 'bg-orange-500/20 border-orange-500/50'
        return 'bg-red-500/20 border-red-500/50'
    }

    return (
        <div className="flex gap-6 h-full">
            <div className="w-80 flex-shrink-0 space-y-4">
                <div className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <Palette className="h-5 w-5" />
                            Palette
                        </h3>
                        <button
                            onClick={clearGrid}
                            className="p-2 hover:bg-muted rounded-lg transition-colors"
                            title="Clear grid"
                        >
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </button>
                    </div>

                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setPaletteTab('mutations')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                                paletteTab === 'mutations'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Mutations
                        </button>
                        <button
                            onClick={() => setPaletteTab('crops')}
                            className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
                                paletteTab === 'crops'
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-muted text-muted-foreground hover:text-foreground'
                            }`}
                        >
                            Crops
                        </button>
                    </div>

                    {selectedItem && (
                        <div className="mb-4 p-3 bg-accent/20 border border-accent rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">Selected:</div>
                            <div className="flex items-center gap-2">
                                {selectedItem.type === 'mutation' ? (
                                    <>
                                        <MutationIcon
                                            mutationId={selectedItem.id}
                                            mutationName={MUTATIONS_DATA[selectedItem.id]?.name || selectedItem.id}
                                            size="small"
                                        />
                                        <span className="font-medium text-foreground">
                                            {MUTATIONS_DATA[selectedItem.id]?.name || selectedItem.id}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <CropIcon crop={selectedItem.id} size="small" />
                                        <span className="font-medium text-foreground">
                                            {selectedItem.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                        </span>
                                    </>
                                )}
                                <button
                                    onClick={() => setSelectedItem(null)}
                                    className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-center text-sm">
                        <div className="p-2 bg-muted rounded-lg">
                            <div className="text-foreground font-bold">{placedCounts.mutations}</div>
                            <div className="text-muted-foreground text-xs">Mutations</div>
                        </div>
                        <div className="p-2 bg-muted rounded-lg">
                            <div className="text-foreground font-bold">{placedCounts.crops}</div>
                            <div className="text-muted-foreground text-xs">Crops</div>
                        </div>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 max-h-[500px] overflow-y-auto">
                    {paletteTab === 'mutations' ? (
                        <div className="space-y-4">
                            {tierNumbers.map(tier => (
                                <div key={tier}>
                                    <div className="text-xs font-medium text-muted-foreground mb-2">
                                        Tier {tier}
                                    </div>
                                    <div className="space-y-1">
                                        {mutationsByTier[tier].map(mutation => {
                                            const isSelected = selectedItem?.type === 'mutation' && selectedItem.id === mutation.id
                                            return (
                                                <button
                                                    key={mutation.id}
                                                    onClick={() => setSelectedItem({ type: 'mutation', id: mutation.id })}
                                                    className={`w-full p-2 rounded-lg border-2 transition-all text-left flex items-center gap-2 ${
                                                        isSelected
                                                            ? 'bg-accent/20 border-accent'
                                                            : 'bg-card border-border hover:border-accent/50'
                                                    }`}
                                                >
                                                    <MutationIcon
                                                        mutationId={mutation.id}
                                                        mutationName={mutation.name}
                                                        size="small"
                                                    />
                                                    <span className="text-sm font-medium text-foreground truncate">
                                                        {mutation.name}
                                                    </span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <div className="text-xs font-medium text-muted-foreground mb-2">
                                    Base Crops
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                    {BASE_CROPS.map(crop => {
                                        const isSelected = selectedItem?.type === 'crop' && selectedItem.id === crop
                                        return (
                                            <button
                                                key={crop}
                                                onClick={() => setSelectedItem({ type: 'crop', id: crop })}
                                                className={`p-2 rounded-lg border-2 transition-all text-left flex items-center gap-2 ${
                                                    isSelected
                                                        ? 'bg-accent/20 border-accent'
                                                        : 'bg-card border-border hover:border-accent/50'
                                                }`}
                                            >
                                                <CropIcon crop={crop} size="small" />
                                                <span className="text-xs font-medium text-foreground truncate">
                                                    {crop.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div>
                                <div className="text-xs font-medium text-muted-foreground mb-2">
                                    Special Conditions
                                </div>
                                <div className="grid grid-cols-2 gap-1">
                                    {EXTRA_CONDITIONS.map(condition => {
                                        const isSelected = selectedItem?.type === 'crop' && selectedItem.id === condition
                                        return (
                                            <button
                                                key={condition}
                                                onClick={() => setSelectedItem({ type: 'crop', id: condition })}
                                                className={`p-2 rounded-lg border-2 transition-all text-left flex items-center gap-2 ${
                                                    isSelected
                                                        ? 'bg-accent/20 border-accent'
                                                        : 'bg-card border-border hover:border-accent/50'
                                                }`}
                                            >
                                                <span className="text-lg">{CROP_EMOJIS[condition]}</span>
                                                <span className="text-xs font-medium text-foreground truncate">
                                                    {condition.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                    <h4 className="font-bold text-sm text-foreground mb-2 flex items-center gap-2">
                        <MousePointer2 className="h-4 w-4" />
                        How to Use
                    </h4>
                    <ul className="text-xs text-muted-foreground space-y-1">
                        <li>1. Select an item from the palette</li>
                        <li>2. Click or drag to place items</li>
                        <li>3. Click/drag occupied cells to remove</li>
                        <li>4. Hover mutations to see effect range</li>
                    </ul>
                </div>
            </div>

            <div className="flex-1 space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="h-5 w-5" />
                        Design Grid
                    </h3>
                    <label className="flex items-center gap-2 text-sm">
                        <input
                            type="checkbox"
                            checked={showEffects}
                            onChange={(e) => setShowEffects(e.target.checked)}
                            className="w-4 h-4 rounded"
                        />
                        <span className="text-muted-foreground">Show Effects</span>
                    </label>
                </div>

                <div className="flex justify-center">
                    <div className="inline-grid grid-cols-10 gap-1 p-4 bg-card border border-border rounded-xl">
                        {grid.map((row, rowIndex) =>
                            row.map((cell, colIndex) => {
                                const isUnlocked = cell.type !== 'locked'
                                const inHoveredRange = isInHoveredRange(rowIndex, colIndex)
                                const effects = showEffects && cell.type === 'crop'
                                    ? calculateCellEffects(rowIndex, colIndex, grid)
                                    : null

                                return (
                                    <div
                                        key={`${rowIndex}-${colIndex}`}
                                        onMouseDown={() => handleCellMouseDown(rowIndex, colIndex)}
                                        onMouseEnter={() => {
                                            setHoveredCell({ row: rowIndex, col: colIndex })
                                            handleCellMouseEnter(rowIndex, colIndex)
                                        }}
                                        onMouseLeave={() => setHoveredCell(null)}
                                        onContextMenu={(e) => handleCellRightClick(e, rowIndex, colIndex)}
                                        className={`
                                            w-12 h-12 rounded-lg border-2 flex flex-col items-center justify-center transition-all relative cursor-pointer select-none
                                            ${cell.type === 'locked' ? 'bg-muted/50 border-border/50 cursor-not-allowed' : ''}
                                            ${cell.type === 'empty' ? 'bg-card border-border hover:border-accent/50' : ''}
                                            ${cell.type === 'mutation' ? ('bg-accent/20 border-accent') : ''}
                                            ${cell.type === 'crop' && effects ? getMultiplierBg(effects.multiplier) : ''}
                                            ${cell.type === 'crop' && !effects ? 'bg-blue-500/20 border-blue-500/50' : ''}
                                            ${inHoveredRange ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-background' : ''}
                                            ${selectedItem && isUnlocked && cell.type === 'empty' ? 'hover:bg-accent/10' : ''}
                                        `}
                                        title={
                                            cell.type === 'mutation' && cell.mutationId
                                                ? `${MUTATIONS_DATA[cell.mutationId]?.name || cell.mutationId}`
                                                : cell.type === 'crop' && cell.cropType
                                                    ? `${cell.cropType}${effects ? `\nMultiplier: ${(effects.multiplier * 100).toFixed(0)}%` : ''}`
                                                    : isUnlocked ? 'Click/drag to place' : 'Locked'
                                        }
                                    >
                                        {cell.type === 'mutation' && cell.mutationId && (
                                            <>
                                                <MutationIcon
                                                    mutationId={cell.mutationId}
                                                    mutationName={MUTATIONS_DATA[cell.mutationId]?.name || cell.mutationId}
                                                    size="small"
                                                />
                                            </>
                                        )}
                                        {cell.type === 'crop' && cell.cropType && (
                                            <>
                                                <CropIcon crop={cell.cropType} size="small" />
                                                {effects && showEffects && (
                                                    <span className={`text-[9px] font-bold ${getMultiplierColor(effects.multiplier)}`}>
                                                        {(effects.multiplier * 100).toFixed(0)}%
                                                    </span>
                                                )}
                                                {effects?.hasImmunity && (
                                                    <span className="absolute top-0 right-0 text-[8px]">🛡️</span>
                                                )}
                                                {effects?.hasBonusDrops && (
                                                    <span className="absolute top-0 left-0 text-[8px]">🎁</span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                    <h4 className="font-bold text-sm text-foreground mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4" />
                        Effect Legend
                    </h4>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-xs">
                        <div className="flex items-center justify-between">
                            <span className="text-green-400">Improved harvest boost</span>
                            <span className="text-green-400">+30%</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-emerald-400">Harvest boost</span>
                            <span className="text-emerald-400">+20%</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-red-400">Harvest loss</span>
                            <span className="text-red-400">-20%</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-yellow-400">Immunity</span>
                            <span className="text-yellow-400">blocks negative</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-blue-400">Effect spread</span>
                            <span className="text-blue-400">range +1</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-purple-400">Improved effect spread</span>
                            <span className="text-purple-400">range +2</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

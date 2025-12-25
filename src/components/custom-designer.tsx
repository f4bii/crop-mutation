import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import { Palette, Trash2, Sparkles, Info, Link, Upload, Grid3X3, RotateCcw, Unlock, Play, Square, Zap, Infinity, CheckSquare, Loader2, Plus, Minus, X, ChevronDown } from "lucide-react"
import { MUTATIONS_DATA } from "@/data/mutationsData"
import { BASE_CROPS, CROP_EMOJIS, EXTRA_CONDITIONS, TIER_COLORS } from "@/data/constants"
import { allMutations } from "@/lib/mutation-data"
import { MutationIcon } from "@/components/icons/MutationIcon"
import { CropIcon } from "@/components/icons/CropIcon"
import { useDesignerDrag } from "@/hooks/useDesignerDrag"
import { optimizeLayout, DEFAULT_CONFIG, QUICK_CONFIG, THOROUGH_CONFIG } from "@utils/optimizer"
import type { CustomDesignGrid, CustomDesignCell, OptimizerConfig, OptimizerProgress, OptimizerResult, ObjectiveType } from "@types"

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
    setUnlockedSlots: (slots: boolean[][]) => void
    resetSlots: () => void
    unlockedMutations: string[]
    setUnlockedMutations: (mutations: string[]) => void
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

function serializeGrid(grid: CustomDesignGrid): string {
    const data: Array<[number, number, string, string?]> = []
    for (let row = 0; row < grid.length; row++) {
        for (let col = 0; col < grid[row].length; col++) {
            const cell = grid[row][col]
            if (cell.type === 'mutation' && cell.mutationId) {
                data.push([row, col, 'm', cell.mutationId])
            } else if (cell.type === 'crop' && cell.cropType) {
                data.push([row, col, 'c', cell.cropType])
            }
        }
    }
    return btoa(JSON.stringify(data))
}

function deserializeGrid(encoded: string, unlockedSlots: boolean[][]): CustomDesignGrid | null {
    try {
        const data = JSON.parse(atob(encoded)) as Array<[number, number, string, string?]>
        const grid = createEmptyGrid(unlockedSlots)

        for (const [row, col, type, id] of data) {
            if (row >= 0 && row < 10 && col >= 0 && col < 10) {
                if (type === 'm' && id) {
                    grid[row][col] = { type: 'mutation', mutationId: id }
                } else if (type === 'c' && id) {
                    grid[row][col] = { type: 'crop', cropType: id }
                }
            }
        }
        return grid
    } catch {
        return null
    }
}

type PresetType = 'quick' | 'default' | 'thorough'

const PRESET_CONFIGS: Record<PresetType, OptimizerConfig> = {
    quick: QUICK_CONFIG,
    default: DEFAULT_CONFIG,
    thorough: THOROUGH_CONFIG,
}

const INFINITE_MODE_CONFIG: OptimizerConfig = {
    maxIterations: 5000,
    startTemperature: 200,
    coolingRate: 0.9995,
    objectiveType: 'MAX_MUTATIONS'
}

export function CustomDesigner({ unlockedSlots, setUnlockedSlots, resetSlots, unlockedMutations, setUnlockedMutations }: CustomDesignerProps) {
    const [grid, setGrid] = useState<CustomDesignGrid>(() => {
        const params = new URLSearchParams(window.location.search)
        const design = params.get('design')
        if (design) {
            const loadedGrid = deserializeGrid(design, unlockedSlots)
            if (loadedGrid) return loadedGrid
        }
        return createEmptyGrid(unlockedSlots)
    })
    const [selectedItem, setSelectedItem] = useState<{ type: 'mutation' | 'crop'; id: string } | null>(null)
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)
    const [showEffects, setShowEffects] = useState(true)
    const [paletteTab, setPaletteTab] = useState<'mutations' | 'crops' | 'unlocked'>('mutations')
    const [copied, setCopied] = useState(false)

    // Grid setup state
    const [isGridDragging, setIsGridDragging] = useState(false)
    const [gridDragMode, setGridDragMode] = useState<"lock" | "unlock">("unlock")
    const [isEditingGrid, setIsEditingGrid] = useState(false)

    // Mutation selection state
    const [selectedMutationCounts, setSelectedMutationCounts] = useState<Record<string, number>>({})
    const [isAddMutationDropdownOpen, setIsAddMutationDropdownOpen] = useState(false)

    // Mobile view state
    const [mobileView, setMobileView] = useState<'palette' | 'grid' | 'tools'>('grid')

    // Optimizer state
    const [preset, setPreset] = useState<PresetType>('default')
    const [objectiveType, setObjectiveType] = useState<ObjectiveType>('MAX_MUTATIONS')
    const [isRunning, setIsRunning] = useState(false)
    const [progress, setProgress] = useState<OptimizerProgress | null>(null)
    const [result, setResult] = useState<OptimizerResult | null>(null)
    const [infiniteMode, setInfiniteMode] = useState(false)
    const [totalIterations, setTotalIterations] = useState(0)
    const abortRef = useRef(false)
    const infiniteModeRef = useRef(false)

    const { handleCellMouseDown, handleCellMouseEnter } = useDesignerDrag(grid, setGrid, selectedItem)

    // Close dropdown when clicking outside
    const dropdownRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsAddMutationDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Sync grid when unlockedSlots change
    useEffect(() => {
        setGrid(prevGrid => {
            const newGrid: CustomDesignGrid = []
            for (let row = 0; row < 10; row++) {
                const rowCells: CustomDesignCell[] = []
                for (let col = 0; col < 10; col++) {
                    const isUnlocked = unlockedSlots[row]?.[col]
                    const prevCell = prevGrid[row]?.[col]

                    if (!isUnlocked) {
                        rowCells.push({ type: 'locked' })
                    } else if (prevCell?.type === 'locked') {
                        rowCells.push({ type: 'empty' })
                    } else {
                        rowCells.push(prevCell || { type: 'empty' })
                    }
                }
                newGrid.push(rowCells)
            }
            return newGrid
        })
    }, [unlockedSlots])

    // Debounced URL update to avoid "too many calls" error
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const encoded = serializeGrid(grid)
            const url = new URL(window.location.href)

            if (encoded && encoded !== serializeGrid(createEmptyGrid(unlockedSlots))) {
                url.searchParams.set('design', encoded)
            } else {
                url.searchParams.delete('design')
            }

            window.history.replaceState({}, '', url.toString())
        }, 300)

        return () => clearTimeout(timeoutId)
    }, [grid, unlockedSlots])

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

    const copyUrlToClipboard = useCallback(async () => {
        try {
            await navigator.clipboard.writeText(window.location.href)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy URL:', err)
        }
    }, [])

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

    // Grid setup handlers
    const handleGridSlotMouseDown = useCallback((row: number, col: number) => {
        setIsGridDragging(true)
        setGridDragMode(unlockedSlots[row][col] ? "lock" : "unlock")
        const newGrid = unlockedSlots.map((r, i) =>
            r.map((slot, j) => (i === row && j === col ? !slot : slot))
        )
        setUnlockedSlots(newGrid)
    }, [unlockedSlots, setUnlockedSlots])

    const handleGridSlotMouseEnter = useCallback((row: number, col: number) => {
        if (isGridDragging) {
            const newGrid = unlockedSlots.map((r, i) =>
                r.map((slot, j) => {
                    if (i === row && j === col) {
                        return gridDragMode === "unlock"
                    }
                    return slot
                })
            )
            setUnlockedSlots(newGrid)
        }
    }, [isGridDragging, gridDragMode, unlockedSlots, setUnlockedSlots])

    const handleGridMouseUp = useCallback(() => {
        setIsGridDragging(false)
    }, [])

    const unlockAllSlots = useCallback(() => {
        setUnlockedSlots(Array(10).fill(null).map(() => Array(10).fill(true)))
    }, [setUnlockedSlots])

    const unlockedCount = useMemo(() => unlockedSlots.flat().filter(Boolean).length, [unlockedSlots])

    // Mutation selection handlers
    const addMutationToSelection = useCallback((mutationId: string) => {
        setSelectedMutationCounts(prev => ({
            ...prev,
            [mutationId]: (prev[mutationId] || 0) + 1
        }))
    }, [])

    const removeMutationFromSelection = useCallback((mutationId: string) => {
        setSelectedMutationCounts(prev => {
            const newCounts = { ...prev }
            delete newCounts[mutationId]
            return newCounts
        })
    }, [])

    const updateMutationCount = useCallback((mutationId: string, count: number) => {
        if (count <= 0) {
            removeMutationFromSelection(mutationId)
        } else {
            setSelectedMutationCounts(prev => ({
                ...prev,
                [mutationId]: count
            }))
        }
    }, [removeMutationFromSelection])

    // Mutation unlock handlers
    const toggleMutation = useCallback((mutationId: string) => {
        if (unlockedMutations.includes(mutationId)) {
            setUnlockedMutations(unlockedMutations.filter((id) => id !== mutationId))
        } else {
            setUnlockedMutations([...unlockedMutations, mutationId])
        }
    }, [unlockedMutations, setUnlockedMutations])

    const selectAllMutations = useCallback(() => {
        setUnlockedMutations(allMutations.map((m) => m.id))
    }, [setUnlockedMutations])

    const clearAllMutations = useCallback(() => {
        setUnlockedMutations([])
    }, [setUnlockedMutations])

    // Optimizer handlers
    const unlockedSlotsSet = useMemo(() => {
        const set = new Set<string>()
        unlockedSlots.forEach((row, rowIndex) => {
            row.forEach((unlocked, colIndex) => {
                if (unlocked) set.add(`${rowIndex},${colIndex}`)
            })
        })
        return set
    }, [unlockedSlots])

    const runInfiniteBatch = useCallback(() => {
        if (!infiniteModeRef.current || abortRef.current) {
            setIsRunning(false)
            return
        }

        // Convert selectedMutationCounts to array format for optimizer
        const mutationsForOptimizer: string[] = []
        Object.entries(selectedMutationCounts).forEach(([mutationId, count]) => {
            for (let i = 0; i < count; i++) {
                mutationsForOptimizer.push(mutationId)
            }
        })

        const config = { ...INFINITE_MODE_CONFIG, objectiveType }
        const batchResult = optimizeLayout(
            unlockedSlotsSet,
            mutationsForOptimizer,
            config,
            (prog) => {
                if (!abortRef.current) {
                    setProgress({
                        ...prog,
                        iteration: prog.iteration + totalIterations,
                        maxIterations: totalIterations + config.maxIterations
                    })
                }
            }
        )

        if (abortRef.current) {
            setIsRunning(false)
            return
        }

        setTotalIterations(prev => prev + config.maxIterations)
        setResult(prevResult => {
            if (!prevResult || batchResult.bestScore > prevResult.bestScore) {
                return batchResult
            }
            return prevResult
        })

        setTimeout(() => runInfiniteBatch(), 10)
    }, [unlockedSlotsSet, selectedMutationCounts, objectiveType, totalIterations])

    const runOptimizer = useCallback(() => {
        if (Object.keys(selectedMutationCounts).length === 0) {
            alert('Please select some mutations first!')
            return
        }
        if (unlockedCount === 0) {
            alert('Please unlock some grid slots first!')
            return
        }

        // Convert selectedMutationCounts to array format for optimizer
        const mutationsForOptimizer: string[] = []
        Object.entries(selectedMutationCounts).forEach(([mutationId, count]) => {
            for (let i = 0; i < count; i++) {
                mutationsForOptimizer.push(mutationId)
            }
        })

        setIsRunning(true)
        setProgress(null)
        setResult(null)
        abortRef.current = false

        if (infiniteMode) {
            setTotalIterations(0)
            infiniteModeRef.current = true
            setTimeout(() => runInfiniteBatch(), 50)
        } else {
            infiniteModeRef.current = false
            setTimeout(() => {
                const config = { ...PRESET_CONFIGS[preset], objectiveType }
                const optimResult = optimizeLayout(
                    unlockedSlotsSet,
                    mutationsForOptimizer,
                    config,
                    (prog) => {
                        if (!abortRef.current) setProgress(prog)
                    }
                )
                if (!abortRef.current) setResult(optimResult)
                setIsRunning(false)
            }, 50)
        }
    }, [selectedMutationCounts, unlockedCount, unlockedSlotsSet, preset, objectiveType, infiniteMode, runInfiniteBatch])

    const stopOptimizer = useCallback(() => {
        abortRef.current = true
        infiniteModeRef.current = false
        setIsRunning(false)
    }, [])

    const applyOptimizedLayout = useCallback(() => {
        if (!result) return
        const newGrid = createEmptyGrid(unlockedSlots)

        // Apply mutations
        result.state.placedMutations.forEach((placed) => {
            const { x, y } = placed.position
            if (newGrid[y]?.[x]) {
                newGrid[y][x] = { type: 'mutation', mutationId: placed.mutationId }
            }
        })

        // Apply crops
        result.state.placedCrops.forEach((placed) => {
            const { x, y } = placed.position
            if (newGrid[y]?.[x] && newGrid[y][x].type === 'empty') {
                newGrid[y][x] = { type: 'crop', cropType: placed.crop }
            }
        })

        setGrid(newGrid)
        setResult(null)
    }, [result, unlockedSlots])

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
        <div className="flex flex-col gap-4 h-full">
            {/* Mobile Navigation Tabs */}
            <div className="lg:hidden grid grid-cols-3 gap-2">
                <button
                    onClick={() => setMobileView('palette')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        mobileView === 'palette' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                >
                    <Palette className="h-4 w-4 mx-auto mb-1" />
                    Palette
                </button>
                <button
                    onClick={() => setMobileView('grid')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        mobileView === 'grid' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                >
                    <Sparkles className="h-4 w-4 mx-auto mb-1" />
                    Grid
                </button>
                <button
                    onClick={() => setMobileView('tools')}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                        mobileView === 'tools' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                    }`}
                >
                    <Zap className="h-4 w-4 mx-auto mb-1" />
                    Tools
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
            {/* Left Sidebar - Palette */}
            <div className={`w-full lg:w-72 flex-shrink-0 space-y-3 ${mobileView !== 'palette' ? 'hidden lg:block' : ''}`}>
                <div className="bg-card border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-foreground flex items-center gap-2">
                            <Palette className="h-4 w-4" />
                            Palette
                        </h3>
                        <div className="flex gap-1">
                            <button
                                onClick={copyUrlToClipboard}
                                className="p-1.5 hover:bg-muted rounded-lg transition-colors"
                                title={copied ? "Copied!" : "Copy shareable URL"}
                            >
                                {copied ? <Upload className="h-3.5 w-3.5 text-green-400" /> : <Link className="h-3.5 w-3.5 text-muted-foreground" />}
                            </button>
                            <button onClick={clearGrid} className="p-1.5 hover:bg-muted rounded-lg transition-colors" title="Clear grid">
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </button>
                        </div>
                    </div>

                    <div className="flex gap-1 mb-3">
                        {(['mutations', 'crops', 'unlocked'] as const).map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setPaletteTab(tab)}
                                className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all ${
                                    paletteTab === tab
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:text-foreground'
                                }`}
                            >
                                {tab.charAt(0).toUpperCase() + tab.slice(1)}
                            </button>
                        ))}
                    </div>

                    {selectedItem && (
                        <div className="mb-3 p-2 bg-accent/20 border border-accent rounded-lg">
                            <div className="text-[10px] text-muted-foreground mb-1">Selected:</div>
                            <div className="flex items-center gap-2">
                                {selectedItem.type === 'mutation' ? (
                                    <>
                                        <MutationIcon mutationId={selectedItem.id} mutationName={MUTATIONS_DATA[selectedItem.id]?.name || selectedItem.id} size="small" />
                                        <span className="text-sm font-medium text-foreground truncate">{MUTATIONS_DATA[selectedItem.id]?.name || selectedItem.id}</span>
                                    </>
                                ) : (
                                    <>
                                        <CropIcon crop={selectedItem.id} size="small" />
                                        <span className="text-sm font-medium text-foreground truncate">{selectedItem.id.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                                    </>
                                )}
                                <button onClick={() => setSelectedItem(null)} className="ml-auto text-[10px] text-muted-foreground hover:text-foreground">Clear</button>
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-2 text-center text-xs">
                        <div className="p-1.5 bg-muted rounded-lg">
                            <div className="text-foreground font-bold">{placedCounts.mutations}</div>
                            <div className="text-muted-foreground text-[10px]">Mutations</div>
                        </div>
                        <div className="p-1.5 bg-muted rounded-lg">
                            <div className="text-foreground font-bold">{placedCounts.crops}</div>
                            <div className="text-muted-foreground text-[10px]">Crops</div>
                        </div>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-3 max-h-64 lg:max-h-[calc(100vh-340px)] overflow-y-auto">
                    {paletteTab === 'mutations' && (
                        <div className="space-y-3">
                            {tierNumbers.map(tier => (
                                <div key={tier}>
                                    <div className="text-[10px] font-medium text-muted-foreground mb-1">Tier {tier}</div>
                                    <div className="space-y-0.5">
                                        {mutationsByTier[tier].map(mutation => {
                                            const isSelected = selectedItem?.type === 'mutation' && selectedItem.id === mutation.id
                                            return (
                                                <button
                                                    key={mutation.id}
                                                    onClick={() => setSelectedItem({ type: 'mutation', id: mutation.id })}
                                                    className={`w-full p-1.5 rounded-lg border transition-all text-left flex items-center gap-2 ${
                                                        isSelected ? 'bg-accent/20 border-accent' : 'bg-card border-border hover:border-accent/50'
                                                    }`}
                                                >
                                                    <MutationIcon mutationId={mutation.id} mutationName={mutation.name} size="small" />
                                                    <span className="text-xs font-medium text-foreground truncate">{mutation.name}</span>
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {paletteTab === 'crops' && (
                        <div className="space-y-3">
                            <div>
                                <div className="text-[10px] font-medium text-muted-foreground mb-1">Base Crops</div>
                                <div className="grid grid-cols-2 gap-0.5">
                                    {BASE_CROPS.map(crop => {
                                        const isSelected = selectedItem?.type === 'crop' && selectedItem.id === crop
                                        return (
                                            <button
                                                key={crop}
                                                onClick={() => setSelectedItem({ type: 'crop', id: crop })}
                                                className={`p-1.5 rounded-lg border transition-all text-left flex items-center gap-1 ${
                                                    isSelected ? 'bg-accent/20 border-accent' : 'bg-card border-border hover:border-accent/50'
                                                }`}
                                            >
                                                <CropIcon crop={crop} size="small" />
                                                <span className="text-[10px] font-medium text-foreground truncate">{crop.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] font-medium text-muted-foreground mb-1">Special</div>
                                <div className="grid grid-cols-2 gap-0.5">
                                    {EXTRA_CONDITIONS.map(condition => {
                                        const isSelected = selectedItem?.type === 'crop' && selectedItem.id === condition
                                        return (
                                            <button
                                                key={condition}
                                                onClick={() => setSelectedItem({ type: 'crop', id: condition })}
                                                className={`p-1.5 rounded-lg border transition-all text-left flex items-center gap-1 ${
                                                    isSelected ? 'bg-accent/20 border-accent' : 'bg-card border-border hover:border-accent/50'
                                                }`}
                                            >
                                                <span className="text-sm">{CROP_EMOJIS[condition]}</span>
                                                <span className="text-[10px] font-medium text-foreground truncate">{condition.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>
                        </div>
                    )}

                    {paletteTab === 'unlocked' && (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-xs text-muted-foreground">{unlockedMutations.length}/{allMutations.length}</span>
                                <div className="flex gap-1">
                                    <button onClick={clearAllMutations} className="px-2 py-0.5 text-[10px] bg-muted rounded hover:bg-muted/80">Clear</button>
                                    <button onClick={selectAllMutations} className="px-2 py-0.5 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90">All</button>
                                </div>
                            </div>
                            {tierNumbers.map(tier => {
                                const tierColor = TIER_COLORS[tier] || TIER_COLORS[0]
                                return (
                                    <div key={tier}>
                                        <div className={`text-[10px] font-medium mb-1 px-1.5 py-0.5 rounded inline-block bg-gradient-to-br ${tierColor.bg} ${tierColor.border} border`}>Tier {tier}</div>
                                        <div className="grid grid-cols-2 gap-0.5">
                                            {mutationsByTier[tier].map(mutation => {
                                                const isUnlocked = unlockedMutations.includes(mutation.id)
                                                return (
                                                    <button
                                                        key={mutation.id}
                                                        onClick={() => toggleMutation(mutation.id)}
                                                        className={`p-1.5 rounded-lg border transition-all text-left flex items-center gap-1 ${
                                                            isUnlocked ? `bg-gradient-to-br ${tierColor.bg} ${tierColor.border}` : 'bg-muted/30 border-border opacity-50'
                                                        }`}
                                                    >
                                                        <MutationIcon mutationId={mutation.id} mutationName={mutation.name} size="small" />
                                                        <span className="text-[10px] font-medium text-foreground truncate">{mutation.name}</span>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Center - Design Grid */}
            <div className={`flex-1 space-y-3 ${mobileView !== 'grid' ? 'hidden lg:block' : ''}`}>
                <div className="flex items-center justify-between">
                    <h3 className="font-bold text-foreground flex items-center gap-2">
                        <Sparkles className="h-4 w-4" />
                        {isEditingGrid ? 'Edit Grid Layout' : 'Design Grid'}
                    </h3>
                    {isEditingGrid ? (
                        <div className="flex items-center gap-2">
                            <button onClick={unlockAllSlots} className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs hover:bg-primary/90 flex items-center gap-1">
                                <Unlock className="h-3 w-3" />
                                Unlock All
                            </button>
                            <button onClick={resetSlots} className="px-3 py-1.5 bg-muted text-foreground rounded-lg text-xs hover:bg-muted/80 flex items-center gap-1">
                                <RotateCcw className="h-3 w-3" />
                                Reset
                            </button>
                            <button onClick={() => setIsEditingGrid(false)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs hover:bg-green-700 flex items-center gap-1">
                                <CheckSquare className="h-3 w-3" />
                                Save
                            </button>
                        </div>
                    ) : (
                        <label className="flex items-center gap-2 text-xs">
                            <input type="checkbox" checked={showEffects} onChange={(e) => setShowEffects(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                            <span className="text-muted-foreground">Effects</span>
                        </label>
                    )}
                </div>

                <div className="flex justify-center overflow-x-auto" onMouseUp={isEditingGrid ? handleGridMouseUp : undefined} onMouseLeave={isEditingGrid ? handleGridMouseUp : undefined}>
                    <div className="inline-grid grid-cols-10 gap-0.5 p-2 sm:p-3 bg-card border border-border rounded-xl">
                        {grid.map((row, rowIndex) =>
                            row.map((cell, colIndex) => {
                                const isUnlocked = cell.type !== 'locked'
                                const inHoveredRange = isInHoveredRange(rowIndex, colIndex)
                                const effects = showEffects && cell.type === 'crop' ? calculateCellEffects(rowIndex, colIndex, grid) : null

                                return (
                                    <div
                                        key={`${rowIndex}-${colIndex}`}
                                        onMouseDown={() => isEditingGrid ? handleGridSlotMouseDown(rowIndex, colIndex) : handleCellMouseDown(rowIndex, colIndex)}
                                        onMouseEnter={() => {
                                            if (isEditingGrid) {
                                                handleGridSlotMouseEnter(rowIndex, colIndex)
                                            } else {
                                                setHoveredCell({ row: rowIndex, col: colIndex })
                                                handleCellMouseEnter(rowIndex, colIndex)
                                            }
                                        }}
                                        onMouseLeave={() => setHoveredCell(null)}
                                        onContextMenu={(e) => handleCellRightClick(e, rowIndex, colIndex)}
                                        className={`
                                            w-8 h-8 sm:w-10 sm:h-10 rounded border flex flex-col items-center justify-center transition-all relative cursor-pointer select-none
                                            ${isEditingGrid ? (isUnlocked ? 'bg-primary border-primary' : 'bg-muted/50 border-border/50') : ''}
                                            ${!isEditingGrid && cell.type === 'locked' ? 'bg-muted/50 border-border/50 cursor-not-allowed' : ''}
                                            ${!isEditingGrid && cell.type === 'empty' ? 'bg-card border-border hover:border-accent/50' : ''}
                                            ${!isEditingGrid && cell.type === 'mutation' ? 'bg-accent/20 border-accent' : ''}
                                            ${!isEditingGrid && cell.type === 'crop' && effects ? getMultiplierBg(effects.multiplier) : ''}
                                            ${!isEditingGrid && cell.type === 'crop' && !effects ? 'bg-blue-500/20 border-blue-500/50' : ''}
                                            ${!isEditingGrid && inHoveredRange ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-background' : ''}
                                            ${!isEditingGrid && selectedItem && isUnlocked && cell.type === 'empty' ? 'hover:bg-accent/10' : ''}
                                        `}
                                    >
                                        {!isEditingGrid && cell.type === 'mutation' && cell.mutationId && (
                                            <MutationIcon mutationId={cell.mutationId} mutationName={MUTATIONS_DATA[cell.mutationId]?.name || cell.mutationId} size="small" />
                                        )}
                                        {!isEditingGrid && cell.type === 'crop' && cell.cropType && (
                                            <>
                                                <CropIcon crop={cell.cropType} size="small" />
                                                {effects && showEffects && (
                                                    <span className={`text-[8px] font-bold ${getMultiplierColor(effects.multiplier)}`}>{(effects.multiplier * 100).toFixed(0)}%</span>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                <div className="bg-card border border-border rounded-xl p-3">
                    <h4 className="font-bold text-xs text-foreground mb-2 flex items-center gap-2">
                        <Info className="h-3.5 w-3.5" />
                        Effect Legend
                    </h4>
                    <div className="grid grid-cols-3 gap-x-4 gap-y-0.5 text-[10px]">
                        <div className="flex items-center justify-between"><span className="text-green-400">Improved boost</span><span className="text-green-400">+30%</span></div>
                        <div className="flex items-center justify-between"><span className="text-emerald-400">Harvest boost</span><span className="text-emerald-400">+20%</span></div>
                        <div className="flex items-center justify-between"><span className="text-red-400">Harvest loss</span><span className="text-red-400">-20%</span></div>
                        <div className="flex items-center justify-between"><span className="text-yellow-400">Immunity</span><span className="text-yellow-400">blocks neg</span></div>
                        <div className="flex items-center justify-between"><span className="text-blue-400">Effect spread</span><span className="text-blue-400">+1 range</span></div>
                        <div className="flex items-center justify-between"><span className="text-purple-400">Improved spread</span><span className="text-purple-400">+2 range</span></div>
                    </div>
                </div>
            </div>

            {/* Right Sidebar - Grid Setup & Optimizer */}
            <div className={`w-full lg:w-64 flex-shrink-0 space-y-3 ${mobileView !== 'tools' ? 'hidden lg:block' : ''}`}>
                {/* Grid Setup */}
                <div className="bg-card border border-border rounded-xl p-3">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="font-bold text-foreground flex items-center gap-2 text-sm">
                            <Grid3X3 className="h-4 w-4" />
                            Grid Setup
                        </h3>
                        <span className="text-xs"><span className="font-bold text-primary">{unlockedCount}</span><span className="text-muted-foreground">/100</span></span>
                    </div>

                    <button
                        onClick={() => setIsEditingGrid(!isEditingGrid)}
                        className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all ${
                            isEditingGrid
                                ? 'bg-green-600 text-white hover:bg-green-700'
                                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                        }`}
                    >
                        <Grid3X3 className="h-4 w-4" />
                        {isEditingGrid ? 'Exit Edit Mode' : 'Edit Grid'}
                    </button>
                </div>

                {/* Optimizer */}
                <div className="bg-card border border-border rounded-xl p-3">
                    <h3 className="font-bold text-foreground flex items-center gap-2 text-sm mb-2">
                        <Zap className="h-4 w-4" />
                        Optimizer
                    </h3>

                    <div className="space-y-2">
                        {/* Add Mutation Dropdown */}
                        <div className="relative" ref={dropdownRef}>
                            <button
                                onClick={() => setIsAddMutationDropdownOpen(!isAddMutationDropdownOpen)}
                                className="w-full px-3 py-2 bg-muted text-foreground rounded-lg text-xs border border-border hover:bg-muted/80 transition-colors flex items-center justify-between"
                            >
                                <span>Select Mutations...</span>
                                <ChevronDown className={`h-3 w-3 transition-transform ${isAddMutationDropdownOpen ? 'rotate-180' : ''}`} />
                            </button>

                            {isAddMutationDropdownOpen && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                                    {tierNumbers.map(tier => {
                                        const tierColor = TIER_COLORS[tier] || TIER_COLORS[0]
                                        return (
                                            <div key={tier} className="p-2">
                                                <div className={`text-[10px] font-medium mb-1 px-1.5 py-0.5 rounded inline-block bg-gradient-to-br ${tierColor.bg} ${tierColor.border} border`}>
                                                    Tier {tier}
                                                </div>
                                                <div className="space-y-0.5">
                                                    {mutationsByTier[tier].map(mutation => (
                                                        <button
                                                            key={mutation.id}
                                                            onClick={() => {
                                                                addMutationToSelection(mutation.id)
                                                                setIsAddMutationDropdownOpen(false)
                                                            }}
                                                            className="w-full p-1.5 rounded-lg border bg-card border-border hover:border-accent/50 transition-all text-left flex items-center gap-2"
                                                        >
                                                            <MutationIcon mutationId={mutation.id} mutationName={mutation.name} size="small" />
                                                            <span className="text-[10px] font-medium text-foreground truncate">{mutation.name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Selected Mutations List */}
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                            {Object.entries(selectedMutationCounts).map(([mutationId, count]) => (
                                <div key={mutationId} className="flex items-center gap-1 bg-muted/50 rounded px-2 py-1">
                                    <MutationIcon mutationId={mutationId} mutationName={MUTATIONS_DATA[mutationId]?.name || mutationId} size="small" />
                                    <span className="text-[10px] font-medium text-foreground flex-1 truncate">
                                        {MUTATIONS_DATA[mutationId]?.name || mutationId}
                                    </span>
                                    <div className="flex items-center gap-0.5">
                                        <button
                                            onClick={() => updateMutationCount(mutationId, count - 1)}
                                            className="p-0.5 hover:bg-muted rounded"
                                        >
                                            <Minus className="h-2.5 w-2.5 text-muted-foreground" />
                                        </button>
                                        <input
                                            type="number"
                                            min="1"
                                            value={count}
                                            onChange={(e) => updateMutationCount(mutationId, parseInt(e.target.value) || 0)}
                                            className="w-8 px-1 py-0.5 text-center bg-card border border-border rounded text-[10px]"
                                        />
                                        <button
                                            onClick={() => updateMutationCount(mutationId, count + 1)}
                                            className="p-0.5 hover:bg-muted rounded"
                                        >
                                            <Plus className="h-2.5 w-2.5 text-muted-foreground" />
                                        </button>
                                        <button
                                            onClick={() => removeMutationFromSelection(mutationId)}
                                            className="p-0.5 hover:bg-destructive/20 rounded ml-0.5"
                                        >
                                            <X className="h-2.5 w-2.5 text-destructive" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {Object.keys(selectedMutationCounts).length === 0 && (
                                <div className="text-center py-2 text-[10px] text-muted-foreground">
                                    No mutations selected
                                </div>
                            )}
                        </div>

                        {/* Optimizer Settings */}
                        <div className="grid grid-cols-3 gap-1">
                            {(['quick', 'default', 'thorough'] as PresetType[]).map((p) => (
                                <button
                                    key={p}
                                    onClick={() => setPreset(p)}
                                    disabled={isRunning}
                                    className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                                        preset === p ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/80'
                                    } disabled:opacity-50`}
                                >
                                    {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-1">
                            <button
                                onClick={() => setObjectiveType('MAX_MUTATIONS')}
                                disabled={isRunning}
                                className={`px-2 py-1.5 rounded text-[10px] transition-all ${
                                    objectiveType === 'MAX_MUTATIONS' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                                } disabled:opacity-50`}
                            >
                                Max Mutations
                            </button>
                            <button
                                onClick={() => setObjectiveType('MAX_PROFIT')}
                                disabled={isRunning}
                                className={`px-2 py-1.5 rounded text-[10px] transition-all ${
                                    objectiveType === 'MAX_PROFIT' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                                } disabled:opacity-50`}
                            >
                                Max Profit
                            </button>
                        </div>

                        <button
                            onClick={() => setInfiniteMode(!infiniteMode)}
                            disabled={isRunning}
                            className={`w-full px-2 py-1.5 rounded text-[10px] flex items-center justify-center gap-1 transition-all ${
                                infiniteMode ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white' : 'bg-muted text-foreground'
                            } disabled:opacity-50`}
                        >
                            <Infinity className="h-3 w-3" />
                            Infinite Mode {infiniteMode && <CheckSquare className="h-3 w-3" />}
                        </button>

                        {!isRunning ? (
                            <button
                                onClick={runOptimizer}
                                disabled={Object.keys(selectedMutationCounts).length === 0 || unlockedCount === 0}
                                className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50"
                            >
                                <Play className="h-3.5 w-3.5" />
                                {infiniteMode ? 'Start Infinite' : 'Run Optimizer'}
                            </button>
                        ) : (
                            <button
                                onClick={stopOptimizer}
                                className="w-full px-3 py-2 rounded-lg bg-destructive text-destructive-foreground text-xs font-medium flex items-center justify-center gap-2"
                            >
                                <Square className="h-3.5 w-3.5" />
                                Stop
                            </button>
                        )}

                        {isRunning && progress && (
                            <div className="space-y-1">
                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                    <span>{infiniteMode ? `Batch ${Math.floor(totalIterations / 5000) + 1}` : 'Progress'}</span>
                                    <span>{infiniteMode ? `${totalIterations.toLocaleString()} total` : `${Math.round((progress.iteration / progress.maxIterations) * 100)}%`}</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary transition-all"
                                        style={{ width: infiniteMode ? '100%' : `${(progress.iteration / progress.maxIterations) * 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[10px]">
                                    <span className="text-muted-foreground">Best: <span className="text-green-500 font-medium">{progress.bestScore.toFixed(1)}</span></span>
                                    <span className="text-muted-foreground">Placed: <span className="text-foreground font-medium">{progress.placedMutationsCount}</span></span>
                                </div>
                            </div>
                        )}

                        {isRunning && !progress && (
                            <div className="flex items-center justify-center py-2">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                <span className="ml-2 text-[10px] text-muted-foreground">Starting...</span>
                            </div>
                        )}

                        {result && !isRunning && (
                            <div className="space-y-2 pt-2 border-t border-border">
                                <div className="grid grid-cols-2 gap-1 text-[10px]">
                                    <div className="bg-muted/50 rounded p-1.5 text-center">
                                        <div className="text-muted-foreground">Score</div>
                                        <div className="font-bold text-foreground">{result.bestScore.toFixed(1)}</div>
                                    </div>
                                    <div className="bg-muted/50 rounded p-1.5 text-center">
                                        <div className="text-muted-foreground">Mutations</div>
                                        <div className="font-bold text-foreground">{result.state.placedMutations.size}</div>
                                    </div>
                                </div>
                                <button
                                    onClick={applyOptimizedLayout}
                                    className="w-full px-3 py-2 rounded-lg bg-green-600 text-white text-xs font-medium hover:bg-green-700"
                                >
                                    Apply to Grid
                                </button>
                            </div>
                        )}

                        {Object.keys(selectedMutationCounts).length === 0 && (
                            <p className="text-[10px] text-muted-foreground text-center py-2">
                                Select mutations above to optimize
                            </p>
                        )}
                    </div>
                </div>
            </div>
            </div>
        </div>
    )
}

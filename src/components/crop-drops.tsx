"use client"

import { useState, useMemo } from "react"
import { Sparkles, Settings, Info } from "lucide-react"
import { BASE_CROPS, CROP_EMOJIS } from "@/data/constants"
import { MUTATIONS_DATA } from "@/data/mutationsData"
import { CropIcon } from "@/components/icons/CropIcon"
import { MutationIcon } from "@/components/icons/MutationIcon"

// Effect constants
const EFFECT_MULTIPLIERS = {
    improved_harvest_boost: 0.30,  // +30%
    harvest_boost: 0.20,           // +20%
    harvest_loss: -0.20,           // -20%
} as const

const EFFECT_SPREAD_RADIUS = {
    none: 1,
    effect_spread: 2,
    improved_effect_spread: 3,
} as const

// Scoring configuration
interface ScoringConfig {
    bonusDropsMultiplier: number  // How much to value bonus drops (e.g., 1.1 = 10% extra)
    immunityValue: number         // Flat bonus per immune crop
}

const DEFAULT_SCORING: ScoringConfig = {
    bonusDropsMultiplier: 1.1,
    immunityValue: 0,
}

interface MutationCandidate {
    id: string
    netScore: number
    spreadRadius: number
    hasImmunity: boolean
    hasBonusDrops: boolean
    harvestBoost: number // Combined multiplier effect
}

// Crops data derived from constants
const CROPS_DATA = BASE_CROPS.map(cropId => ({
    id: cropId,
    name: cropId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    icon: null,
    iconSmall: null,
    emoji: CROP_EMOJIS[cropId] || '🌱',
}))

interface CropDropsProps {
    unlockedSlots: boolean[][]
}

interface CellEffect {
    multiplier: number
    hasImmunity: boolean
    hasBonusDrops: boolean
    sources: { mutationId: string; effect: string; value: number }[]
}

interface OptimizedCell {
    type: 'crop' | 'mutation' | 'empty' | 'locked'
    content: string | null
    effects: CellEffect
    mutationData?: MutationCandidate
}

// Result of an optimization strategy
interface OptimizationResult {
    placedMutations: Map<string, { row: number; col: number; id: string }>
    cropPlacements: Map<string, string>
    score: number
    cropCount: number
    totalMultiplier: number
    strategyName: string
}

interface Settings {
    countBonusDrops: boolean
    showEffectOverlay: boolean
}

// Get all mutations that have harvest-related effects with scoring
function getMutationsWithHarvestEffects(): MutationCandidate[] {
    const relevantMutations: MutationCandidate[] = []

    for (const [id, data] of Object.entries(MUTATIONS_DATA)) {
        const hasHarvestEffect = data.effects.some(e =>
            e === 'improved_harvest_boost' ||
            e === 'harvest_boost' ||
            e === 'harvest_loss' ||
            e === 'immunity' ||
            e === 'bonus_drops'
        )

        if (hasHarvestEffect) {
            let spreadRadius: 1|2|3 = EFFECT_SPREAD_RADIUS.none
            if (data.effects.includes('improved_effect_spread')) {
                spreadRadius = EFFECT_SPREAD_RADIUS.improved_effect_spread
            } else if (data.effects.includes('effect_spread')) {
                spreadRadius = EFFECT_SPREAD_RADIUS.effect_spread
            }

            // Calculate net score for this mutation
            let netScore = 0
            let harvestBoost = 0
            for (const effect of data.effects) {
                // if (effect in MUTATION_SCORES) {
                //     netScore += MUTATION_SCORES[effect as keyof typeof MUTATION_SCORES]
                // }
                if (effect === 'improved_harvest_boost') harvestBoost += 0.30
                if (effect === 'harvest_boost') harvestBoost += 0.20
                if (effect === 'harvest_loss') harvestBoost -= 0.20
            }

            // Boost score based on spread radius (affects more cells)
            netScore *= spreadRadius

            relevantMutations.push({
                id,
                netScore,
                spreadRadius,
                hasImmunity: data.effects.includes('immunity'),
                hasBonusDrops: data.effects.includes('bonus_drops'),
                harvestBoost,
            })
        }
    }

    // Sort by net score (best first)
    return relevantMutations.sort((a, b) => b.netScore - a.netScore)
}

// Count how many unlocked cells are within range of a position
function countCellsInRange(
    row: number,
    col: number,
    radius: number,
    unlockedPositions: { row: number; col: number }[],
    occupiedCells: Set<string>
): number {
    let count = 0
    for (const pos of unlockedPositions) {
        if (occupiedCells.has(`${pos.row},${pos.col}`)) continue
        const distance = Math.max(Math.abs(pos.row - row), Math.abs(pos.col - col))
        if (distance <= radius && distance > 0) { // Don't count the mutation cell itself
            count++
        }
    }
    return count
}

// Find the best position for a mutation to maximize coverage
function findBestMutationPosition(
    mutation: MutationCandidate,
    unlockedPositions: { row: number; col: number }[],
    occupiedCells: Set<string>,
    existingMutations: Map<string, { row: number; col: number; mutation: MutationCandidate }>
): { row: number; col: number; score: number } | null {
    let bestPosition: { row: number; col: number; score: number } | null = null

    for (const pos of unlockedPositions) {
        const key = `${pos.row},${pos.col}`
        if (occupiedCells.has(key)) continue

        // Calculate how many crop cells this mutation would affect
        const cellsInRange = countCellsInRange(pos.row, pos.col, mutation.spreadRadius, unlockedPositions, occupiedCells)

        // Skip if no cells would be affected
        if (cellsInRange === 0) continue

        // Base score: cells affected * spread radius bonus
        let positionScore = cellsInRange * 10 * mutation.spreadRadius

        // Add harvest boost contribution
        if (mutation.harvestBoost > 0) {
            positionScore += cellsInRange * mutation.harvestBoost * 100
        }

        // Add base value for beneficial effects
        if (mutation.hasImmunity) {
            positionScore += cellsInRange * 15 // Immunity is valuable per cell affected
        }
        if (mutation.hasBonusDrops) {
            positionScore += cellsInRange * 12 // Bonus drops add value per cell
        }

        // Bonus: If this mutation has immunity, it's more valuable near negative-effect mutations
        if (mutation.hasImmunity) {
            for (const [, existing] of existingMutations) {
                if (existing.mutation.harvestBoost < 0) {
                    const distance = Math.max(Math.abs(pos.row - existing.row), Math.abs(pos.col - existing.col))
                    if (distance <= mutation.spreadRadius) {
                        positionScore += 50 // Bonus for neutralizing negative effects
                    }
                }
            }
        }

        // Bonus: Synergy with existing positive mutations (effect stacking)
        for (const [, existing] of existingMutations) {
            if (existing.mutation.harvestBoost > 0) {
                const distance = Math.max(Math.abs(pos.row - existing.row), Math.abs(pos.col - existing.col))
                // Overlapping positive effects are good
                if (distance <= Math.max(mutation.spreadRadius, existing.mutation.spreadRadius)) {
                    positionScore += 20
                }
            }
        }

        // Penalty: Avoid placing pure negative mutations unless they have other benefits
        if (mutation.harvestBoost < 0 && !mutation.hasImmunity && !mutation.hasBonusDrops) {
            positionScore -= 100
        }

        // Slight preference for positions that spread effects well (not too close to edges)
        const distFromEdge = Math.min(pos.row, pos.col, 9 - pos.row, 9 - pos.col)
        positionScore += distFromEdge

        if (!bestPosition || positionScore > bestPosition.score) {
            bestPosition = { row: pos.row, col: pos.col, score: positionScore }
        }
    }

    return bestPosition
}

// Strategy types for optimization
type OptimizationStrategy = 'maximize_crops' | 'balanced' | 'maximize_boost' | 'no_mutations'

// Place mutations and crops, then fill remaining with crops
function placeMutationsAndCrops(
    unlockedPositions: { row: number; col: number }[],
    selectedCrops: string[],
    mutations: MutationCandidate[],
    maxMutations: number = Infinity
): { placedMutations: Map<string, { row: number; col: number; id: string }>; cropPlacements: Map<string, string> } {
    const placedMutations = new Map<string, { row: number; col: number; id: string }>()
    const mutationDetails = new Map<string, { row: number; col: number; mutation: MutationCandidate }>()
    const occupiedCells = new Set<string>()

    let placedCount = 0
    for (const mutation of mutations) {
        if (placedCount >= maxMutations) break

        const bestPos = findBestMutationPosition(mutation, unlockedPositions, occupiedCells, mutationDetails)

        if (bestPos && bestPos.score > 0) {
            const key = `${bestPos.row},${bestPos.col}`
            placedMutations.set(key, { row: bestPos.row, col: bestPos.col, id: mutation.id })
            mutationDetails.set(key, { row: bestPos.row, col: bestPos.col, mutation })
            occupiedCells.add(key)
            placedCount++
        }
    }

    // Fill remaining cells with crops
    const cropPlacements = new Map<string, string>()
    let cropIndex = 0
    for (const pos of unlockedPositions) {
        const key = `${pos.row},${pos.col}`
        if (!occupiedCells.has(key) && selectedCrops.length > 0) {
            cropPlacements.set(key, selectedCrops[cropIndex % selectedCrops.length])
            cropIndex++
        }
    }

    return { placedMutations, cropPlacements }
}

// Run a single optimization strategy and return the result
function runOptimizationStrategy(
    strategy: OptimizationStrategy,
    unlockedPositions: { row: number; col: number }[],
    selectedCrops: string[],
    scoringConfig: ScoringConfig
): OptimizationResult {
    const mutations = getMutationsWithHarvestEffects()

    // Filter mutations based on strategy
    let filteredMutations: MutationCandidate[]
    let maxMutations: number
    let strategyName: string

    switch (strategy) {
        case 'no_mutations':
            // No mutations - all crops
            filteredMutations = []
            maxMutations = 0
            strategyName = 'No Mutations (All Crops)'
            break

        case 'maximize_crops':
            // Only use high-value mutations that affect many cells
            filteredMutations = mutations.filter(m =>
                m.harvestBoost >= 0.20 && m.spreadRadius >= 2
            )
            maxMutations = Math.floor(unlockedPositions.length * 0.1) // Max 10% mutations
            strategyName = 'Maximize Crops (Few Mutations)'
            break

        case 'maximize_boost':
            // Use all beneficial mutations aggressively
            filteredMutations = mutations.filter(m =>
                m.harvestBoost > 0 || m.hasImmunity || m.hasBonusDrops
            )
            maxMutations = Infinity
            strategyName = 'Maximize Boost (Many Mutations)'
            break

        case 'balanced':
        default:
            // Balanced approach - only clearly beneficial mutations
            filteredMutations = mutations.filter(m =>
                m.harvestBoost > 0 || m.hasImmunity || m.hasBonusDrops
            )
            maxMutations = Math.floor(unlockedPositions.length * 0.25) // Max 25% mutations
            strategyName = 'Balanced'
            break
    }

    const { placedMutations, cropPlacements } = placeMutationsAndCrops(
        unlockedPositions,
        selectedCrops,
        filteredMutations,
        maxMutations
    )

    const { score, cropCount, totalMultiplier } = calculateLayoutScore(
        placedMutations,
        cropPlacements,
        scoringConfig
    )

    return {
        placedMutations,
        cropPlacements,
        score,
        cropCount,
        totalMultiplier,
        strategyName,
    }
}

// Run all optimization strategies and return sorted by score
function optimizeWithAllStrategies(
    unlockedPositions: { row: number; col: number }[],
    selectedCrops: string[],
    scoringConfig: ScoringConfig
): OptimizationResult[] {
    const strategies: OptimizationStrategy[] = ['no_mutations', 'maximize_crops', 'balanced', 'maximize_boost']

    const results = strategies.map(strategy =>
        runOptimizationStrategy(strategy, unlockedPositions, selectedCrops, scoringConfig)
    )

    // Sort by score descending
    return results.sort((a, b) => b.score - a.score)
}

// Calculate distance between two cells (Chebyshev distance for grid)
function getCellDistance(r1: number, c1: number, r2: number, c2: number): number {
    return Math.max(Math.abs(r1 - r2), Math.abs(c1 - c2))
}

// Calculate the score for a layout based on how many crops can be farmed
// Score = sum of (crop multiplier) for each crop cell, with bonuses for bonus drops
function calculateLayoutScore(
    placedMutations: Map<string, { row: number; col: number; id: string }>,
    cropPlacements: Map<string, string>,
    scoringConfig: ScoringConfig = DEFAULT_SCORING
): { score: number; cropCount: number; totalMultiplier: number } {
    let totalScore = 0
    let cropCount = 0
    let totalMultiplier = 0

    for (const [key] of cropPlacements) {
        const [row, col] = key.split(',').map(Number)
        const effects = calculateCellEffects(row, col, placedMutations)

        cropCount++
        let cellScore = effects.multiplier

        // Apply bonus drops multiplier if present
        if (effects.hasBonusDrops) {
            cellScore *= scoringConfig.bonusDropsMultiplier
        }

        // Add immunity value if present
        if (effects.hasImmunity) {
            cellScore += scoringConfig.immunityValue
        }

        totalScore += cellScore
        totalMultiplier += effects.multiplier
    }

    return {
        score: totalScore,
        cropCount,
        totalMultiplier,
    }
}

// Calculate effects at a specific cell position given placed mutations
function calculateCellEffects(
    row: number,
    col: number,
    placedMutations: Map<string, { row: number; col: number; id: string }>
): CellEffect {
    const effects: CellEffect = {
        multiplier: 1.0,
        hasImmunity: false,
        hasBonusDrops: false,
        sources: [],
    }

    // Check each placed mutation
    for (const [, mutation] of placedMutations) {
        const mutationData = MUTATIONS_DATA[mutation.id]
        if (!mutationData) continue

        // Calculate spread radius for this mutation
        let spreadRadius: 1|2|3 = EFFECT_SPREAD_RADIUS.none
        if (mutationData.effects.includes('improved_effect_spread')) {
            spreadRadius = EFFECT_SPREAD_RADIUS.improved_effect_spread
        } else if (mutationData.effects.includes('effect_spread')) {
            spreadRadius = EFFECT_SPREAD_RADIUS.effect_spread
        }

        const distance = getCellDistance(row, col, mutation.row, mutation.col)

        // Check if this cell is within range of the mutation's effects
        if (distance <= spreadRadius) {
            // First pass: check for immunity
            if (mutationData.effects.includes('immunity')) {
                effects.hasImmunity = true
                effects.sources.push({ mutationId: mutation.id, effect: 'immunity', value: 0 })
            }
        }
    }

    // Second pass: apply harvest effects
    for (const [, mutation] of placedMutations) {
        const mutationData = MUTATIONS_DATA[mutation.id]
        if (!mutationData) continue

        let spreadRadius: 1|2|3 = EFFECT_SPREAD_RADIUS.none
        if (mutationData.effects.includes('improved_effect_spread')) {
            spreadRadius = EFFECT_SPREAD_RADIUS.improved_effect_spread
        } else if (mutationData.effects.includes('effect_spread')) {
            spreadRadius = EFFECT_SPREAD_RADIUS.effect_spread
        }

        const distance = getCellDistance(row, col, mutation.row, mutation.col)

        if (distance <= spreadRadius) {
            for (const effect of mutationData.effects) {
                if (effect === 'improved_harvest_boost') {
                    effects.multiplier += EFFECT_MULTIPLIERS.improved_harvest_boost
                    effects.sources.push({ mutationId: mutation.id, effect, value: EFFECT_MULTIPLIERS.improved_harvest_boost })
                } else if (effect === 'harvest_boost') {
                    effects.multiplier += EFFECT_MULTIPLIERS.harvest_boost
                    effects.sources.push({ mutationId: mutation.id, effect, value: EFFECT_MULTIPLIERS.harvest_boost })
                } else if (effect === 'harvest_loss' && !effects.hasImmunity) {
                    effects.multiplier += EFFECT_MULTIPLIERS.harvest_loss
                    effects.sources.push({ mutationId: mutation.id, effect, value: EFFECT_MULTIPLIERS.harvest_loss })
                } else if (effect === 'bonus_drops') {
                    effects.hasBonusDrops = true
                    effects.sources.push({ mutationId: mutation.id, effect, value: 0 })
                }
            }
        }
    }

    // Ensure multiplier doesn't go below 0
    effects.multiplier = Math.max(0, effects.multiplier)

    return effects
}

export function CropDrops({ unlockedSlots }: CropDropsProps) {
    const [selectedCrops, setSelectedCrops] = useState<string[]>([])
    const [optimizedGrid, setOptimizedGrid] = useState<OptimizedCell[][] | null>(null)
    const [allResults, setAllResults] = useState<OptimizationResult[]>([])
    const [selectedStrategyIndex, setSelectedStrategyIndex] = useState(0)
    const [settings, setSettings] = useState<Settings>({
        countBonusDrops: true,
        showEffectOverlay: true,
    })
    const [showSettings, setShowSettings] = useState(false)
    const [hoveredMutation, setHoveredMutation] = useState<{ row: number; col: number; radius: number } | null>(null)

    const relevantMutations = useMemo(() => getMutationsWithHarvestEffects(), [])

    // Check if a cell is within range of the hovered mutation
    const isInHoveredRange = (row: number, col: number): boolean => {
        if (!hoveredMutation) return false
        const distance = Math.max(Math.abs(row - hoveredMutation.row), Math.abs(col - hoveredMutation.col))
        return distance <= hoveredMutation.radius && distance > 0
    }

    const toggleCrop = (cropId: string) => {
        setSelectedCrops((prev) => (prev.includes(cropId) ? prev.filter((id) => id !== cropId) : [...prev, cropId]))
    }

    // Build grid from an optimization result
    const buildGridFromResult = (
        result: OptimizationResult,
        unlockedPositions: { row: number; col: number }[]
    ): OptimizedCell[][] => {
        const grid: OptimizedCell[][] = Array(10)
            .fill(null)
            .map(() => Array(10).fill(null).map(() => ({
                type: 'locked' as const,
                content: null,
                effects: { multiplier: 1.0, hasImmunity: false, hasBonusDrops: false, sources: [] }
            })))

        // Mark unlocked slots
        for (const pos of unlockedPositions) {
            grid[pos.row][pos.col] = {
                type: 'empty',
                content: null,
                effects: { multiplier: 1.0, hasImmunity: false, hasBonusDrops: false, sources: [] }
            }
        }

        // Get mutation candidates for display data
        const mutationCandidates = getMutationsWithHarvestEffects()
        const mutationLookup = new Map(mutationCandidates.map(m => [m.id, m]))

        // Place mutations in grid
        for (const [, mutation] of result.placedMutations) {
            const mutationData = mutationLookup.get(mutation.id)
            grid[mutation.row][mutation.col] = {
                type: 'mutation',
                content: mutation.id,
                effects: { multiplier: 1.0, hasImmunity: false, hasBonusDrops: false, sources: [] },
                mutationData,
            }
        }

        // Place crops in grid
        for (const [key, cropId] of result.cropPlacements) {
            const [row, col] = key.split(',').map(Number)
            grid[row][col] = {
                type: 'crop',
                content: cropId,
                effects: { multiplier: 1.0, hasImmunity: false, hasBonusDrops: false, sources: [] }
            }
        }

        // Calculate effects for each cell
        for (let row = 0; row < 10; row++) {
            for (let col = 0; col < 10; col++) {
                if (grid[row][col].type === 'crop') {
                    grid[row][col].effects = calculateCellEffects(row, col, result.placedMutations)
                }
            }
        }

        return grid
    }

    const optimizeDrops = () => {
        // Gather unlocked positions
        const unlockedPositions: { row: number; col: number }[] = []
        unlockedSlots.forEach((row, rowIndex) => {
            row.forEach((unlocked, colIndex) => {
                if (unlocked) {
                    unlockedPositions.push({ row: rowIndex, col: colIndex })
                }
            })
        })

        if (selectedCrops.length === 0) {
            const emptyGrid: OptimizedCell[][] = Array(10)
                .fill(null)
                .map((_, rowIndex) => Array(10).fill(null).map((_, colIndex) => ({
                    type: unlockedSlots[rowIndex]?.[colIndex] ? 'empty' as const : 'locked' as const,
                    content: null,
                    effects: { multiplier: 1.0, hasImmunity: false, hasBonusDrops: false, sources: [] }
                })))
            setOptimizedGrid(emptyGrid)
            setAllResults([])
            return
        }

        // Run all optimization strategies
        const scoringConfig: ScoringConfig = {
            ...DEFAULT_SCORING,
            bonusDropsMultiplier: settings.countBonusDrops ? 1.1 : 1.0,
        }

        const results = optimizeWithAllStrategies(unlockedPositions, selectedCrops, scoringConfig)
        setAllResults(results)
        setSelectedStrategyIndex(0) // Select best strategy by default

        // Build grid from best result
        const grid = buildGridFromResult(results[0], unlockedPositions)
        setOptimizedGrid(grid)
    }

    // Switch to a different strategy
    const selectStrategy = (index: number) => {
        if (index < 0 || index >= allResults.length) return

        const unlockedPositions: { row: number; col: number }[] = []
        unlockedSlots.forEach((row, rowIndex) => {
            row.forEach((unlocked, colIndex) => {
                if (unlocked) {
                    unlockedPositions.push({ row: rowIndex, col: colIndex })
                }
            })
        })

        setSelectedStrategyIndex(index)
        const grid = buildGridFromResult(allResults[index], unlockedPositions)
        setOptimizedGrid(grid)
    }

    const getCropData = (cropId: string) => {
        return CROPS_DATA.find((c) => c.id === cropId)
    }

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
        if (multiplier >= 1.0) return 'bg-card border-border'
        if (multiplier >= 0.8) return 'bg-orange-500/20 border-orange-500/50'
        return 'bg-red-500/20 border-red-500/50'
    }

    // Calculate total average multiplier
    const averageMultiplier = useMemo(() => {
        if (!optimizedGrid) return 1
        let total = 0
        let count = 0
        optimizedGrid.forEach(row => {
            row.forEach(cell => {
                if (cell.type === 'crop') {
                    total += cell.effects.multiplier
                    count++
                }
            })
        })
        return count > 0 ? total / count : 1
    }, [optimizedGrid])

    // Count placed mutations
    const placedMutationsCount = useMemo(() => {
        if (!optimizedGrid) return 0
        let count = 0
        optimizedGrid.forEach(row => {
            row.forEach(cell => {
                if (cell.type === 'mutation') {
                    count++
                }
            })
        })
        return count
    }, [optimizedGrid])

    // Count cells with bonus effects
    const bonusStats = useMemo(() => {
        if (!optimizedGrid) return { immune: 0, bonus: 0, boosted: 0 }
        let immune = 0
        let bonus = 0
        let boosted = 0
        optimizedGrid.forEach(row => {
            row.forEach(cell => {
                if (cell.type === 'crop') {
                    if (cell.effects.hasImmunity) immune++
                    if (cell.effects.hasBonusDrops) bonus++
                    if (cell.effects.multiplier > 1) boosted++
                }
            })
        })
        return { immune, bonus, boosted }
    }, [optimizedGrid])

    return (
        <div className="flex gap-6 h-full">
            {/* Left side - Crop Selection & Settings */}
            <div className="w-80 flex-shrink-0 space-y-4">
                {/* Settings Panel */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <button
                        onClick={() => setShowSettings(!showSettings)}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                            <Settings className="h-5 w-5" />
                            Settings
                        </h3>
                        <span className="text-muted-foreground">{showSettings ? '▼' : '▶'}</span>
                    </button>

                    {showSettings && (
                        <div className="mt-4 space-y-3">
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.countBonusDrops}
                                    onChange={(e) => setSettings(s => ({ ...s, countBonusDrops: e.target.checked }))}
                                    className="w-4 h-4 rounded"
                                />
                                <span className="text-sm text-foreground">Count Bonus Drops</span>
                            </label>
                            <p className="text-xs text-muted-foreground ml-7">
                                Include bonus_drops effect in optimization
                            </p>

                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={settings.showEffectOverlay}
                                    onChange={(e) => setSettings(s => ({ ...s, showEffectOverlay: e.target.checked }))}
                                    className="w-4 h-4 rounded"
                                />
                                <span className="text-sm text-foreground">Show Effect Overlay</span>
                            </label>
                            <p className="text-xs text-muted-foreground ml-7">
                                Display multiplier values on grid cells
                            </p>
                        </div>
                    )}
                </div>

                {/* Effect Legend */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2 mb-4">
                        <Info className="h-5 w-5" />
                        Effects
                    </h3>
                    <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                            <span className="text-green-400">improved_harvest_boost</span>
                            <span className="text-green-400">+30%</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-emerald-400">harvest_boost</span>
                            <span className="text-emerald-400">+20%</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-red-400">harvest_loss</span>
                            <span className="text-red-400">-20%</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-blue-400">effect_spread</span>
                            <span className="text-blue-400">+1 range</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-purple-400">improved_effect_spread</span>
                            <span className="text-purple-400">+2 range</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-yellow-400">immunity</span>
                            <span className="text-yellow-400">blocks negative</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-cyan-400">bonus_drops</span>
                            <span className="text-cyan-400">extra loot pool</span>
                        </div>
                    </div>
                </div>

                {/* Crop Selection */}
                <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-lg font-bold text-foreground mb-4">Select Crops</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                        Choose which crops you want to optimize for maximum drops
                    </p>

                    <div className="space-y-2 max-h-[400px] overflow-y-auto">
                        {CROPS_DATA.map((crop) => {
                            const isSelected = selectedCrops.includes(crop.id)
                            return (
                                <button
                                    key={crop.id}
                                    onClick={() => toggleCrop(crop.id)}
                                    className={`
                                        w-full p-3 rounded-lg border-2 transition-all text-left
                                        ${isSelected
                                            ? "bg-primary/20 border-primary text-foreground"
                                            : "bg-card border-border hover:border-primary/50"
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 flex items-center justify-center">
                                            <CropIcon crop={crop.id} size="large" />
                                        </div>
                                        <div className="flex-1">
                                            <div className="font-medium text-sm">{crop.name}</div>
                                        </div>
                                        {isSelected && (
                                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                                                <span className="text-xs text-primary-foreground">✓</span>
                                            </div>
                                        )}
                                    </div>
                                </button>
                            )
                        })}
                    </div>

                    <button
                        onClick={optimizeDrops}
                        disabled={selectedCrops.length === 0}
                        className="w-full mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all flex items-center justify-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Sparkles className="h-5 w-5" />
                        Optimize Layout
                    </button>
                </div>
            </div>

            {/* Right side - Grid Optimizer */}
            <div className="flex-1">
                {optimizedGrid ? (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-foreground">Optimized Crop Layout</h3>
                            <div className="flex items-center gap-4 text-sm">
                                <div className="text-muted-foreground">
                                    {selectedCrops.length} crop type{selectedCrops.length !== 1 ? "s" : ""}
                                </div>
                                <div className={`font-medium ${getMultiplierColor(averageMultiplier)}`}>
                                    Avg: {(averageMultiplier * 100).toFixed(0)}%
                                </div>
                                {bonusStats.boosted > 0 && (
                                    <div className="text-green-400">
                                        {bonusStats.boosted} boosted
                                    </div>
                                )}
                                {bonusStats.immune > 0 && (
                                    <div className="text-yellow-400">
                                        {bonusStats.immune} immune
                                    </div>
                                )}
                                {bonusStats.bonus > 0 && (
                                    <div className="text-cyan-400">
                                        {bonusStats.bonus} bonus
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Strategy Comparison Panel */}
                        {allResults.length > 0 && (
                            <div className="bg-card border border-border rounded-xl p-4">
                                <h4 className="font-bold text-sm text-foreground mb-3">Compare Strategies (by Crop Score)</h4>
                                <div className="grid grid-cols-2 gap-2">
                                    {allResults.map((result, index) => {
                                        const isSelected = index === selectedStrategyIndex
                                        const isBest = index === 0
                                        return (
                                            <button
                                                key={result.strategyName}
                                                onClick={() => selectStrategy(index)}
                                                className={`
                                                    p-3 rounded-lg border-2 text-left transition-all
                                                    ${isSelected
                                                        ? 'bg-primary/20 border-primary'
                                                        : 'bg-card border-border hover:border-primary/50'
                                                    }
                                                `}
                                            >
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="font-medium text-sm text-foreground">
                                                        {result.strategyName}
                                                    </span>
                                                    {isBest && (
                                                        <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded">
                                                            BEST
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground space-y-0.5">
                                                    <div className="flex justify-between">
                                                        <span>Crops:</span>
                                                        <span className="text-foreground font-medium">{result.cropCount}</span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Score:</span>
                                                        <span className={`font-medium ${result.score === allResults[0].score ? 'text-green-400' : 'text-foreground'}`}>
                                                            {result.score.toFixed(2)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between">
                                                        <span>Avg Multiplier:</span>
                                                        <span className="text-foreground font-medium">
                                                            {result.cropCount > 0 ? ((result.totalMultiplier / result.cropCount) * 100).toFixed(0) : 100}%
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        )
                                    })}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-2">
                                    Score = Sum of (crop multiplier) for each crop. Higher score = more effective crops harvested.
                                </p>
                            </div>
                        )}

                        <div className="flex justify-center">
                            <div className="inline-grid grid-cols-10 gap-1 p-4 bg-card border border-border rounded-xl">
                                {optimizedGrid.map((row, rowIndex) =>
                                    row.map((cell, colIndex) => {
                                        const crop = cell.type === 'crop' && cell.content ? getCropData(cell.content) : null
                                        const mutation = cell.type === 'mutation' && cell.content ? MUTATIONS_DATA[cell.content] : null
                                        // Check if crop cell actually contains a mutation (used as requirement)
                                        const cropIsMutation = cell.type === 'crop' && cell.content && !crop ? MUTATIONS_DATA[cell.content] : null
                                        const isUnlocked = cell.type !== 'locked'

                                        // Get mutation effect color
                                        const getMutationColor = () => {
                                            if (!cell.mutationData) return 'bg-purple-500/20 border-purple-500/50'
                                            if (cell.mutationData.harvestBoost > 0.25) return 'bg-green-500/30 border-green-500/60'
                                            if (cell.mutationData.harvestBoost > 0) return 'bg-emerald-500/20 border-emerald-500/50'
                                            if (cell.mutationData.hasImmunity) return 'bg-yellow-500/20 border-yellow-500/50'
                                            if (cell.mutationData.hasBonusDrops) return 'bg-cyan-500/20 border-cyan-500/50'
                                            return 'bg-purple-500/20 border-purple-500/50'
                                        }

                                        const inHoveredRange = isInHoveredRange(rowIndex, colIndex)

                                        return (
                                            <div
                                                key={`${rowIndex}-${colIndex}`}
                                                className={`
                                                    w-12 h-12 rounded-lg border-2 flex flex-col items-center justify-center transition-all relative
                                                    ${cell.type === 'crop'
                                                        ? getMultiplierBg(cell.effects.multiplier)
                                                        : cell.type === 'mutation'
                                                            ? getMutationColor()
                                                            : isUnlocked
                                                                ? "bg-card border-border"
                                                                : "bg-muted/50 border-border/50"
                                                    }
                                                    ${inHoveredRange ? 'ring-2 ring-purple-400 ring-offset-1 ring-offset-background' : ''}
                                                `}
                                                onMouseEnter={() => {
                                                    if (cell.type === 'mutation' && cell.mutationData) {
                                                        setHoveredMutation({
                                                            row: rowIndex,
                                                            col: colIndex,
                                                            radius: cell.mutationData.spreadRadius
                                                        })
                                                    }
                                                }}
                                                onMouseLeave={() => {
                                                    if (cell.type === 'mutation') {
                                                        setHoveredMutation(null)
                                                    }
                                                }}
                                                title={
                                                    cell.type === 'crop' && crop
                                                        ? `${crop.name}\nMultiplier: ${(cell.effects.multiplier * 100).toFixed(0)}%${cell.effects.hasImmunity ? '\n🛡️ Immune to negative effects' : ''}${cell.effects.hasBonusDrops ? '\n🎁 Bonus drops active' : ''}`
                                                        : cell.type === 'mutation' && mutation
                                                            ? `${mutation.name}\n${cell.mutationData?.harvestBoost ? `Harvest: ${cell.mutationData.harvestBoost > 0 ? '+' : ''}${(cell.mutationData.harvestBoost * 100).toFixed(0)}%` : ''}\nRadius: ${cell.mutationData?.spreadRadius || 1}\n(Hover to see affected area)`
                                                            : isUnlocked
                                                                ? "Empty"
                                                                : "Locked"
                                                }
                                            >
                                                {cell.type === 'crop' && (crop || cropIsMutation) && (
                                                    <>
                                                        <div className="flex items-center justify-center">
                                                            {crop ? (
                                                                <CropIcon crop={crop.id} size="medium" />
                                                            ) : cropIsMutation && cell.content ? (
                                                                <MutationIcon
                                                                    mutationId={cell.content}
                                                                    mutationName={cropIsMutation.name}
                                                                    fallbackIcon="🌱"
                                                                    size="small"
                                                                />
                                                            ) : null}
                                                        </div>
                                                        {settings.showEffectOverlay && (
                                                            <span className={`text-[10px] font-bold ${getMultiplierColor(cell.effects.multiplier)}`}>
                                                                {(cell.effects.multiplier * 100).toFixed(0)}%
                                                            </span>
                                                        )}
                                                        {cell.effects.hasImmunity && (
                                                            <span className="absolute top-0 right-0 text-[8px]">🛡️</span>
                                                        )}
                                                        {cell.effects.hasBonusDrops && (
                                                            <span className="absolute top-0 left-0 text-[8px]">🎁</span>
                                                        )}
                                                    </>
                                                )}
                                                {cell.type === 'mutation' && mutation && cell.content && (
                                                    <>
                                                        <MutationIcon
                                                            mutationId={cell.content}
                                                            mutationName={mutation.name}
                                                            fallbackIcon="🌱"
                                                            size="small"
                                                        />
                                                        {cell.mutationData?.hasImmunity && (
                                                            <span className="absolute top-0 right-0 text-[8px]">🛡️</span>
                                                        )}
                                                        {cell.mutationData?.hasBonusDrops && (
                                                            <span className="absolute top-0 left-0 text-[8px]">🎁</span>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )
                                    }),
                                )}
                            </div>
                        </div>

                        {selectedCrops.length > 0 && (
                            <div className="bg-accent/5 border border-accent/20 rounded-xl p-5">
                                <h4 className="font-bold text-sm text-foreground mb-3">Selected Crops</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedCrops.map((cropId) => {
                                        const crop = getCropData(cropId)
                                        if (!crop) return null
                                        return (
                                            <div key={cropId} className="px-3 py-2 bg-card border border-accent/30 rounded-lg text-sm flex items-center gap-2">
                                                <div className="w-6 h-6 flex items-center justify-center">
                                                    <CropIcon crop={crop.id} size="medium" />
                                                </div>
                                                <span className="font-medium text-foreground">{crop.name}</span>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )}

                        {/* Placed Mutations Summary */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h4 className="font-bold text-sm text-foreground mb-3">
                                Placed Mutations ({placedMutationsCount})
                            </h4>
                            {placedMutationsCount > 0 ? (
                                <div className="grid grid-cols-2 gap-2 max-h-[200px] overflow-y-auto">
                                    {optimizedGrid.flatMap((row, ri) =>
                                        row.map((cell, ci) => {
                                            if (cell.type !== 'mutation' || !cell.content) return null
                                            const data = MUTATIONS_DATA[cell.content]
                                            if (!data) return null
                                            return (
                                                <div
                                                    key={`${ri}-${ci}`}
                                                    className={`px-2 py-1 rounded text-xs ${
                                                        cell.mutationData?.harvestBoost && cell.mutationData.harvestBoost > 0
                                                            ? 'bg-green-500/20 border border-green-500/30'
                                                            : cell.mutationData?.hasImmunity
                                                                ? 'bg-yellow-500/20 border border-yellow-500/30'
                                                                : 'bg-muted/50'
                                                    }`}
                                                >
                                                    <span className="font-medium">{data.name}</span>
                                                    <div className="text-muted-foreground text-[10px] flex gap-1 flex-wrap">
                                                        {cell.mutationData?.harvestBoost !== 0 && (
                                                            <span className={cell.mutationData?.harvestBoost && cell.mutationData.harvestBoost > 0 ? 'text-green-400' : 'text-red-400'}>
                                                                {cell.mutationData?.harvestBoost && cell.mutationData.harvestBoost > 0 ? '+' : ''}{((cell.mutationData?.harvestBoost || 0) * 100).toFixed(0)}%
                                                            </span>
                                                        )}
                                                        {cell.mutationData?.hasImmunity && <span className="text-yellow-400">immunity</span>}
                                                        {cell.mutationData?.hasBonusDrops && <span className="text-cyan-400">bonus</span>}
                                                        <span className="text-blue-400">r{cell.mutationData?.spreadRadius || 1}</span>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    ).filter(Boolean)}
                                </div>
                            ) : (
                                <p className="text-sm text-muted-foreground">
                                    No mutations placed. Increase unlocked slots for mutation placement.
                                </p>
                            )}
                        </div>

                        {/* Available Mutations Reference */}
                        <div className="bg-card border border-border rounded-xl p-5">
                            <h4 className="font-bold text-sm text-foreground mb-3">
                                Available Harvest Mutations ({relevantMutations.length})
                            </h4>
                            <div className="grid grid-cols-2 gap-2 max-h-[150px] overflow-y-auto">
                                {relevantMutations.slice(0, 10).map((mutation) => {
                                    const data = MUTATIONS_DATA[mutation.id]
                                    return (
                                        <div
                                            key={mutation.id}
                                            className="px-2 py-1 bg-muted/50 rounded text-xs"
                                            title={`Score: ${mutation.netScore}, Radius: ${mutation.spreadRadius}`}
                                        >
                                            <span className="font-medium">{data.name}</span>
                                            <div className="text-muted-foreground text-[10px]">
                                                {mutation.harvestBoost !== 0 && (
                                                    <span className={mutation.harvestBoost > 0 ? 'text-green-400' : 'text-red-400'}>
                                                        {mutation.harvestBoost > 0 ? '+' : ''}{(mutation.harvestBoost * 100).toFixed(0)}%{' '}
                                                    </span>
                                                )}
                                                {mutation.hasImmunity && <span className="text-yellow-400">immunity </span>}
                                                {mutation.hasBonusDrops && <span className="text-cyan-400">bonus </span>}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full py-20 text-center bg-card border-2 border-dashed border-border rounded-xl">
                        <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
                        <p className="text-base font-medium text-foreground mb-2">
                            {selectedCrops.length === 0 ? "No crops selected" : "Ready to optimize"}
                        </p>
                        <p className="text-sm text-muted-foreground max-w-md">
                            {selectedCrops.length === 0
                                ? "Select crops from the left panel to begin"
                                : "Click Optimize Layout to generate your crop distribution"}
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

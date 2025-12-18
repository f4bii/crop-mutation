import { allMutations, getMutation } from "@/lib/mutation-data"
import { optimizeLayout } from "@utils/layoutOptimizer"
import { MUTATIONS_DATA } from "@data/mutationsData"
import { Sparkles } from "lucide-react"
import { MutationTooltip } from "./mutation-tooltip"
import { MutationIcon } from "./icons/MutationIcon"
import { CropIcon } from "./icons/CropIcon"
import type { OptimizedLayout, GridCell } from "@types"

interface LayoutViewProps {
  unlockedSlots: boolean[][]
  targetMutations: { id: string; count: number }[]
  layout: OptimizedLayout | null
  setLayout: (layout: OptimizedLayout) => void
}

export function LayoutView({ unlockedSlots, targetMutations, layout, setLayout }: LayoutViewProps) {

  const generateLayout = () => {
    // Convert boolean[][] to Set<string>
    const unlockedSet = new Set<string>()
    unlockedSlots.forEach((row, rowIndex) => {
      row.forEach((unlocked, colIndex) => {
        if (unlocked) {
          unlockedSet.add(`${rowIndex},${colIndex}`)
        }
      })
    })

    // Convert targetMutations to Map<string, number>
    const targetMap = new Map<string, number>()
    targetMutations.forEach(({ id, count }) => {
      targetMap.set(id, count)
    })

    // Get available mutations based on what's unlocked
    // For now, we'll use all mutations as available
    const availableMutations = MUTATIONS_DATA

    const result = optimizeLayout(availableMutations, targetMap, unlockedSet)
    setLayout(result)
  }

  const getCellMutation = (cell: GridCell) => {
    if (!cell) return null
    if (cell.type === 'mutation_area') {
      return getMutation(cell.mutationId)
    }
    return null
  }

  return (
    <div className="space-y-6">
      {targetMutations.length > 0 && (
        <div className="bg-accent/5 border border-accent/20 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {targetMutations.map((target) => {
                const mutation = allMutations.find((m) => m.id === target.id)
                return (
                  <div key={target.id} className="px-3 py-1.5 bg-card border border-accent/30 rounded-lg text-sm flex items-center gap-2">
                    {mutation && (
                      <MutationIcon
                        mutationId={mutation.id}
                        mutationName={mutation.name}
                        fallbackIcon={mutation.icon}
                        size="small"
                      />
                    )}
                    <span className="font-medium text-foreground">{mutation?.name}</span>
                    <span className="text-accent-foreground ml-2">×{target.count}</span>
                  </div>
                )
              })}
            </div>
            <button
              onClick={generateLayout}
              className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all flex items-center gap-2 font-medium shadow-lg shadow-primary/20"
            >
              <Sparkles className="h-5 w-5" />
              Generate Layout
            </button>
          </div>
        </div>
      )}

      {layout ? (
        <div className="space-y-6">
          <div className="flex justify-center">
            <div className="inline-grid grid-cols-10 gap-3 p-6 bg-card border border-border rounded-xl">
              {layout.grid.map((row, rowIndex) =>
                row.map((cell, colIndex) => {
                  const mutationData = getCellMutation(cell)
                  const isUnlocked = unlockedSlots[rowIndex]?.[colIndex] || false

                  return (
                    <div key={`${rowIndex}-${colIndex}`}>
                      {mutationData && cell?.type === 'mutation_area' && cell.isCenter ? (
                        <MutationTooltip mutation={mutationData}>
                          <div className="w-16 h-16 rounded-lg border-2 flex items-center justify-center transition-all bg-accent/20 border-accent shadow-md cursor-help">
                            <MutationIcon
                              mutationId={mutationData.id}
                              mutationName={mutationData.name}
                              fallbackIcon={mutationData.icon}
                              size="medium"
                            />
                          </div>
                        </MutationTooltip>
                      ) : cell?.type === 'mutation_area' ? (
                        <div className="w-16 h-16 rounded-lg border-2 flex items-center justify-center transition-all bg-accent/10 border-accent/50" />
                      ) : cell?.type === 'crop' ? (
                        (() => {
                          // Check if this is a mutation being used as a requirement
                          const mutationReq = getMutation(cell.crop)
                          const cropName = mutationReq?.name || cell.crop.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
                          const forMutationName = cell.forMutation ? (getMutation(cell.forMutation)?.name || cell.forMutation) : 'unknown'

                          return (
                            <div
                              className="w-16 h-16 rounded-lg border-2 flex items-center justify-center transition-all cursor-help bg-blue-500/20 border-blue-500/50 hover:bg-blue-500/30 hover:border-blue-500/70 hover:scale-105"
                              title={`${cropName}\nRequired for: ${forMutationName}${cell.forMutations && cell.forMutations.length > 1 ? ` (+${cell.forMutations.length - 1} more)` : ''}`}
                            >
                              {mutationReq ? (
                                <MutationIcon
                                  mutationId={mutationReq.id}
                                  mutationName={mutationReq.name}
                                  fallbackIcon={mutationReq.icon}
                                  size="large"
                                />
                              ) : (
                                <CropIcon crop={cell.crop} size="large" />
                              )}
                            </div>
                          )
                        })()

                      ) : cell?.type === 'empty_zone' ? (
                        <div className="w-16 h-16 rounded-lg border-2 flex items-center justify-center transition-all bg-red-500/10 border-red-500/30" />
                      ) : (
                        <div
                          className={`
                            w-16 h-16 rounded-lg border-2 flex items-center justify-center transition-all
                            ${!isUnlocked ? "bg-muted border-border" : "bg-card border-border"}
                          `}
                          title={isUnlocked ? "Empty" : "Locked"}
                        />
                      )}
                    </div>
                  )
                }),
              )}
            </div>
          </div>

          {layout.mutations.length > 0 && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-sm font-medium text-muted-foreground">{layout.mutations.length} placed</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {layout.mutations.map((placedMutation, idx) => {
                  const mutationData = getMutation(placedMutation.id)
                  if (!mutationData) return null

                  return (
                    <MutationTooltip key={`${placedMutation.id}-${idx}`} mutation={mutationData}>
                      <div className="p-4 rounded-lg border border-accent/30 bg-accent/5 cursor-help">
                        <div className="flex items-start gap-3">
                          <MutationIcon
                            mutationId={mutationData.id}
                            mutationName={mutationData.name}
                            fallbackIcon={mutationData.icon}
                            size="small"
                          />
                          <div className="flex-1">
                            <div className="font-bold text-base text-foreground">{mutationData.name}</div>
                            <div className="text-xs text-muted-foreground">
                              Row {placedMutation.position.y + 1}, Col {placedMutation.position.x + 1}
                            </div>
                          </div>
                        </div>
                      </div>
                    </MutationTooltip>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card border-2 border-dashed border-border rounded-xl">
          <Sparkles className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-base font-medium text-foreground mb-2">
            {targetMutations.length === 0 ? "No targets selected" : "Ready to generate"}
          </p>
          <p className="text-sm text-muted-foreground max-w-md">
            {targetMutations.length === 0
              ? "Select mutations in the Targets step"
              : "Click Generate Layout to create your optimized garden"}
          </p>
        </div>
      )}
    </div>
  )
}

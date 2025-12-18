import { allMutations } from "@/lib/mutation-data"
import { Minus, Plus } from "lucide-react"
import { MutationTooltip } from "./mutation-tooltip"
import { MutationIcon } from "./icons/MutationIcon"

interface TargetMutationsProps {
  unlockedMutations: string[]
  targetMutations: { id: string; count: number }[]
  setTargetMutations: (targets: { id: string; count: number }[]) => void
}

export function TargetMutations({ unlockedMutations, targetMutations, setTargetMutations }: TargetMutationsProps) {
  const updateCount = (mutationId: string, count: number) => {
    if (count <= 0) {
      setTargetMutations(targetMutations.filter((t) => t.id !== mutationId))
    } else {
      const existing = targetMutations.find((t) => t.id === mutationId)
      if (existing) {
        setTargetMutations(targetMutations.map((t) => (t.id === mutationId ? { ...t, count } : t)))
      } else {
        setTargetMutations([...targetMutations, { id: mutationId, count }])
      }
    }
  }

  const selectAllNew = () => {
    const newMutations = allMutations
      .filter((m) => !unlockedMutations.includes(m.id))
      .map((m) => ({ id: m.id, count: 1 }))
    setTargetMutations(newMutations)
  }

  const clearAll = () => {
    setTargetMutations([])
  }

  const availableMutations = allMutations.filter((m) => unlockedMutations.includes(m.id))
  const unavailableMutations = allMutations.filter((m) => !unlockedMutations.includes(m.id))

  const totalTargets = targetMutations.reduce((sum, t) => sum + t.count, 0)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="text-lg">
          <span className="font-bold text-2xl text-primary">{totalTargets}</span>
          <span className="text-muted-foreground ml-2">total instances across {targetMutations.length} mutations</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={clearAll}
            className="px-5 py-2.5 bg-card border-2 border-border text-foreground rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all font-medium"
          >
            Clear All
          </button>
          <button
            onClick={selectAllNew}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-medium"
          >
            Select All New
          </button>
        </div>
      </div>

      {unavailableMutations.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="px-4 py-1.5 bg-muted border border-border rounded-lg">
              <span className="text-sm font-bold text-muted-foreground">LOCKED</span>
            </div>
            <span className="text-sm text-muted-foreground">Unlock these mutations first to target them</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 opacity-50">
            {unavailableMutations.slice(0, 4).map((mutation) => (
              <MutationTooltip key={mutation.id} mutation={mutation}>
                <div className="p-4 rounded-xl border-2 border-border bg-muted">
                  <div className="flex items-center gap-4">
                    <MutationIcon
                      mutationId={mutation.id}
                      mutationName={mutation.name}
                      fallbackIcon={mutation.icon}
                      size="small"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground">{mutation.name}</div>
                      <div className="text-sm text-muted-foreground">Tier {mutation.tier} - Not yet unlocked</div>
                    </div>
                  </div>
                </div>
              </MutationTooltip>
            ))}
          </div>
          {unavailableMutations.length > 4 && (
            <p className="text-sm text-muted-foreground text-center mt-3">
              +{unavailableMutations.length - 4} more locked mutations
            </p>
          )}
        </div>
      )}

      <div>
        <div className="flex items-center gap-3 mb-4">
          <div className="px-4 py-1.5 bg-accent/10 border border-accent/30 rounded-lg">
            <span className="text-sm font-bold text-accent-foreground">AVAILABLE</span>
          </div>
          <span className="text-sm text-muted-foreground">Set how many of each mutation you want to grow</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableMutations.map((mutation) => {
            const target = targetMutations.find((t) => t.id === mutation.id)
            const count = target?.count || 0

            return (
              <MutationTooltip key={mutation.id} mutation={mutation}>
                <div
                  className={`
                    p-5 rounded-xl border-2 transition-all
                    ${count > 0 ? "border-accent bg-accent/10 shadow-md" : "border-border bg-card"}
                  `}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <MutationIcon
                        mutationId={mutation.id}
                        mutationName={mutation.name}
                        fallbackIcon={mutation.icon}
                        size="medium"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-lg text-foreground">{mutation.name}</div>
                        <div className="text-sm text-muted-foreground">Tier {mutation.tier}</div>
                        {mutation.requirements.length > 0 && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Requires: {mutation.requirements.map((req) => `${req.plant} ×${req.count}`).join(", ")}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateCount(mutation.id, Math.max(0, count - 1))}
                        disabled={count === 0}
                        className="w-10 h-10 flex items-center justify-center bg-card border-2 border-border rounded-lg hover:border-primary hover:bg-primary/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <Minus className="h-5 w-5 text-foreground" />
                      </button>
                      <input
                        type="number"
                        value={count}
                        onChange={(e) => updateCount(mutation.id, Number.parseInt(e.target.value) || 0)}
                        className="w-16 h-10 text-center text-lg font-bold border-2 border-border bg-card rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                        min="0"
                      />
                      <button
                        onClick={() => updateCount(mutation.id, count + 1)}
                        className="w-10 h-10 flex items-center justify-center bg-primary border-2 border-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-all"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                </div>
              </MutationTooltip>
            )
          })}
        </div>
      </div>
    </div>
  )
}

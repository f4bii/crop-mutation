import { allMutations } from "@/lib/mutation-data"
import { MutationTooltip } from "./mutation-tooltip"
import { MutationIcon } from "./icons/MutationIcon"

interface UnlockedMutationsProps {
  unlockedMutations: string[]
  setUnlockedMutations: (mutations: string[]) => void
}

export function UnlockedMutations({ unlockedMutations, setUnlockedMutations }: UnlockedMutationsProps) {
  const toggleMutation = (mutationId: string) => {
    if (unlockedMutations.includes(mutationId)) {
      setUnlockedMutations(unlockedMutations.filter((id) => id !== mutationId))
    } else {
      setUnlockedMutations([...unlockedMutations, mutationId])
    }
  }

  const selectAll = () => {
    setUnlockedMutations(allMutations.map((m) => m.id))
  }

  const clearAll = () => {
    setUnlockedMutations([])
  }

  const groupedByTier = allMutations.reduce(
    (acc, mutation) => {
      if (!acc[mutation.tier]) {
        acc[mutation.tier] = []
      }
      acc[mutation.tier].push(mutation)
      return acc
    },
    {} as Record<number, typeof allMutations>,
  )

  return (
    <div className="space-y-8">

      <div className="flex items-center justify-between">
        <div className="text-lg">
          <span className="font-bold text-2xl text-primary">{unlockedMutations.length}</span>
          <span className="text-muted-foreground ml-2">of {allMutations.length} mutations unlocked</span>
        </div>
        <div className="flex gap-3">
          <button
            onClick={clearAll}
            className="px-5 py-2.5 bg-card border-2 border-border text-foreground rounded-xl hover:border-primary/50 hover:bg-primary/5 transition-all font-medium"
          >
            Clear All
          </button>
          <button
            onClick={selectAll}
            className="px-5 py-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 transition-colors font-medium"
          >
            Select All
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {Object.entries(groupedByTier).map(([tier, mutations]) => (

          <div key={tier}>
            <div className="flex items-center gap-3 mb-4">
              <div className="px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-lg">
                <span className="text-sm font-bold text-primary">TIER {tier}</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {mutations.filter((m) => unlockedMutations.includes(m.id)).length} of {mutations.length} unlocked
              </span>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {mutations.map((mutation) => {
                const isUnlocked = unlockedMutations.includes(mutation.id)
                return (
                  <MutationTooltip key={mutation.id} mutation={mutation}>
                    <button
                      onClick={() => toggleMutation(mutation.id)}
                      className={`
                        w-full h-32 p-4 rounded-xl border-2 transition-all text-center transform hover:scale-105 flex flex-col items-center justify-center
                        ${
                          isUnlocked
                            ? "bg-primary/10 border-primary shadow-md"
                            : "bg-card border-border hover:border-primary/30"
                        }
                      `}
                    >
                      <div className="mb-2">
                        <MutationIcon
                          mutationId={mutation.id}
                          mutationName={mutation.name}
                          size="medium"
                        />
                      </div>
                      <div className="text-xs font-medium text-foreground line-clamp-2">{mutation.name}</div>
                    </button>
                  </MutationTooltip>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

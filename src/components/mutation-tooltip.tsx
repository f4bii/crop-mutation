import type React from "react"
import { useState } from "react"
import type { MutationData } from "@/lib/mutation-data"
import { getMutation } from "@/lib/mutation-data"
import { MutationIcon } from "./icons/MutationIcon"
import { CropIcon } from "./icons/CropIcon"

interface MutationTooltipProps {
  mutation: MutationData
  children: React.ReactNode
}

export function MutationTooltip({ mutation, children }: MutationTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)

  return (
    <div className="relative" onMouseEnter={() => setIsVisible(true)} onMouseLeave={() => setIsVisible(false)}>
      {children}
      {isVisible && (
        <div className="absolute z-50 w-72 p-4 bg-popover border-2 border-border rounded-xl shadow-xl -translate-x-1/2 left-1/2 bottom-full mb-2 pointer-events-none">
          <div className="flex items-start gap-3 mb-3">
            <MutationIcon
              mutationId={mutation.id}
              mutationName={mutation.name}
              size="medium"
            />
            <div className="flex-1 min-w-0">
              <div className="font-bold text-lg text-popover-foreground">{mutation.name}</div>
              <div className="text-sm text-muted-foreground">Tier {mutation.tier}</div>
            </div>
          </div>

          {mutation.ground && (
            <div className="mb-3 p-2 bg-accent/10 border border-accent/20 rounded-lg">
              <div className="text-xs font-medium text-muted-foreground mb-1">Ground Type</div>
              <div className="text-sm text-foreground capitalize">{mutation.ground}</div>
            </div>
          )}

          {mutation.requirements.length > 0 ? (
            <div className="mb-2">
              <div className="text-xs font-medium text-muted-foreground mb-2">Requirements</div>
              <div className="space-y-1.5">
                {mutation.requirements.map((req, idx) => {
                  const mutationData = getMutation(req.plant)
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2 bg-card border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        {mutationData ? (
                          <MutationIcon
                            mutationId={mutationData.id}
                            mutationName={mutationData.name}
                            size="small"
                          />
                        ) : (
                          <CropIcon crop={req.plant} size="small" />
                        )}
                        <span className="text-sm text-foreground">
                          {mutationData?.name || req.plant.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-primary">×{req.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="p-2 bg-accent/5 border border-accent/20 rounded-lg">
              <div className="text-xs text-muted-foreground">No special requirements</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

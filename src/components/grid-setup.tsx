import { useState } from "react"

interface GridSetupProps {
  unlockedSlots: boolean[][]
  setUnlockedSlots: (slots: boolean[][]) => void
  resetSlots: () => void
}

export function GridSetup({ unlockedSlots, setUnlockedSlots, resetSlots }: GridSetupProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [dragMode, setDragMode] = useState<"lock" | "unlock">("unlock")

  const unlockedCount = unlockedSlots.flat().filter(Boolean).length

  const handleSlotClick = (row: number, col: number) => {
    const newGrid = unlockedSlots.map((r, i) => r.map((slot, j) => (i === row && j === col ? !slot : slot)))
    setUnlockedSlots(newGrid)
  }

  const handleMouseDown = (row: number, col: number) => {
    setIsDragging(true)
    setDragMode(unlockedSlots[row][col] ? "lock" : "unlock")
    handleSlotClick(row, col)
  }

  const handleMouseEnter = (row: number, col: number) => {
    if (isDragging) {
      const newGrid = unlockedSlots.map((r, i) =>
        r.map((slot, j) => {
          if (i === row && j === col) {
            return dragMode === "unlock"
          }
          return slot
        }),
      )
      setUnlockedSlots(newGrid)
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const unlockAll = () => {
    setUnlockedSlots(
      Array(10)
        .fill(null)
        .map(() => Array(10).fill(true)),
    )
  }

  const lockAll = () => {
    setUnlockedSlots(
      Array(10)
        .fill(null)
        .map(() => Array(10).fill(false)),
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="text-base">
          <span className="font-bold text-xl text-primary">{unlockedCount}</span>
          <span className="text-muted-foreground ml-2">/ 100 slots</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetSlots}
            className="px-4 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted transition-all text-sm"
          >
            Reset
          </button>
          <button
            onClick={lockAll}
            className="px-4 py-2 bg-card border border-border text-foreground rounded-lg hover:bg-muted transition-all text-sm"
          >
            Lock All
          </button>
          <button
            onClick={unlockAll}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm"
          >
            Unlock All
          </button>
        </div>
      </div>

      <div className="flex justify-center py-4" onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <div className="inline-grid grid-cols-10 gap-3 p-6 bg-card border border-border rounded-xl">
          {unlockedSlots.map((row, rowIndex) =>
            row.map((unlocked, colIndex) => (
              <button
                key={`${rowIndex}-${colIndex}`}
                className={`
                  w-16 h-16 rounded-lg border-2 transition-all transform hover:scale-105
                  ${
                    unlocked
                      ? "bg-primary border-primary shadow-lg shadow-primary/20"
                      : "bg-muted border-border hover:border-primary/30"
                  }
                `}
                onMouseDown={() => handleMouseDown(rowIndex, colIndex)}
                onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
              />
            )),
          )}
        </div>
      </div>
    </div>
  )
}

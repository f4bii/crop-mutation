import {useState} from "react"
import {Sprout} from "lucide-react"
import {getDefaultUnlockedSlots} from "@data/constants"
import {CustomDesigner} from "@components/custom-designer.tsx";

const getDefaultGrid = (): boolean[][] => {
    const grid = Array(10)
        .fill(null)
        .map(() => Array(10).fill(false))
    const pattern = getDefaultUnlockedSlots()
    pattern.forEach((key) => {
        const [row, col] = key.split(",").map(Number)
        grid[row][col] = true
    })
    return grid
}

// Parse design URL and get slots that need to be unlocked
const getInitialUnlockedSlots = (): boolean[][] => {
    const grid = getDefaultGrid()

    try {
        const params = new URLSearchParams(window.location.search)
        const design = params.get('design')
        if (design) {
            const data = JSON.parse(atob(design)) as Array<[number, number, string, string?]>
            for (const [row, col] of data) {
                if (row >= 0 && row < 10 && col >= 0 && col < 10) {
                    grid[row][col] = true
                }
            }
        }
    } catch {
        // Invalid design param, use default
        console.log("Error in getInitialUnlockedSlots")
    }

    return grid
}

export default function CropMutationLab() {
    const [unlockedSlots, setUnlockedSlots] = useState<boolean[][]>(getInitialUnlockedSlots)
    const [unlockedMutations, setUnlockedMutations] = useState<string[]>([])

    const unlockedCount = unlockedSlots.flat().filter(Boolean).length

    return (
        <div className="min-h-screen bg-background">
            <header className="bg-card border-b border-border">
                <div className="mx-auto px-3 sm:px-6 py-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 sm:gap-3">
                            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-primary rounded-lg flex items-center justify-center">
                                <Sprout className="w-4 h-4 sm:w-5 sm:h-5 text-primary-foreground"/>
                            </div>
                            <h1 className="text-base sm:text-xl font-bold text-foreground">Crop Mutation Lab</h1>
                        </div>

                        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                            <div className="flex items-center gap-1 sm:gap-2">
                                <div className="w-2 h-2 rounded-full bg-accent"></div>
                                <span className="text-muted-foreground">
                                    <span className="font-bold text-foreground">{unlockedCount}</span> <span className="hidden sm:inline">slots</span>
                                </span>
                            </div>
                            <div className="flex items-center gap-1 sm:gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary"></div>
                                <span className="text-muted-foreground">
                                    <span className="font-bold text-foreground">{unlockedMutations.length}</span> <span className="hidden sm:inline">mutations</span>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            <main className="px-2 sm:px-4 py-3 sm:py-4">
                <CustomDesigner
                    unlockedSlots={unlockedSlots}
                    setUnlockedSlots={setUnlockedSlots}
                    resetSlots={() => setUnlockedSlots(getDefaultGrid)}
                    unlockedMutations={unlockedMutations}
                    setUnlockedMutations={setUnlockedMutations}
                />
            </main>
        </div>
    )
}

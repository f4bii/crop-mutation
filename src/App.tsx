import {useState} from "react"
import {Sprout} from "lucide-react"
import {GridSetup} from "@components/grid-setup"
import {UnlockedMutations} from "@components/unlocked-mutations"
import {getDefaultUnlockedSlots} from "@data/constants"
import {CustomDesigner} from "@components/custom-designer.tsx";

type StepType = "grid" | "unlocked" | "designer"

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

export default function CropMutationLab() {
    const [currentStep, setCurrentStep] = useState<StepType>("grid")

    const [unlockedSlots, setUnlockedSlots] = useState<boolean[][]>(getDefaultGrid)

    const [unlockedMutations, setUnlockedMutations] = useState<string[]>([])

    const unlockedCount = unlockedSlots.flat().filter(Boolean).length

    const steps = [
        {number: "grid", title: "Grid Setup"},
        {number: "unlocked", title: "Unlocked"},
        {number: "designer", title: "Designer"},
    ]

    return (
        <div className="min-h-screen bg-background">
            <header className="bg-card border-b border-border">
                <div className="mx-auto max-w-7xl px-6 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center">
                                <Sprout className="w-5 h-5 text-primary-foreground"/>
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-foreground">Crop Mutation Lab</h1>
                            </div>
                        </div>

                        <div className="flex items-center gap-6 text-sm">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-accent"></div>
                                <span className="text-muted-foreground">
                  <span className="font-bold text-foreground">{unlockedCount}</span> slots
                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-primary"></div>
                                <span className="text-muted-foreground">
                  <span className="font-bold text-foreground">{unlockedMutations.length}</span> unlocked
                </span>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        {steps.map((step) => {
                            const isActive = currentStep === step.number
                            return (
                                <button
                                    key={step.number}
                                    onClick={() => setCurrentStep(step.number as StepType)}
                                    className={`
                    px-6 py-2 rounded-lg transition-all font-medium text-sm
                    ${
                                        isActive
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-card text-foreground hover:bg-muted border border-border"
                                    }
                  `}
                                >
                                    {step.title}
                                </button>
                            )
                        })}
                    </div>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-6 py-8">
                {currentStep === "grid" && <GridSetup unlockedSlots={unlockedSlots} setUnlockedSlots={setUnlockedSlots}
                                                 resetSlots={() => setUnlockedSlots(getDefaultGrid)}/>}
                {currentStep === "unlocked" && (
                    <UnlockedMutations unlockedMutations={unlockedMutations}
                                       setUnlockedMutations={setUnlockedMutations}/>
                )}
                {currentStep === "designer" && (
                    <CustomDesigner unlockedSlots={unlockedSlots}/>
                )}
            </main>
        </div>
    )
}

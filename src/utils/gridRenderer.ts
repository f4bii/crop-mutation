import type { CustomDesignGrid } from "@types"
import { MUTATIONS_DATA } from "@/data/mutationsData"
import { CROP_EMOJIS } from "@/data/constants"

const CELL_SIZE = 60
const GRID_SIZE = 10
const PADDING = 40
const CANVAS_WIDTH = GRID_SIZE * CELL_SIZE + PADDING * 2
const CANVAS_HEIGHT = GRID_SIZE * CELL_SIZE + PADDING * 2 + 60 // Extra space for title

export async function renderGridToCanvas(grid: CustomDesignGrid): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_WIDTH
    canvas.height = CANVAS_HEIGHT
    const ctx = canvas.getContext('2d')!

    // Background
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

    // Title
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 24px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Hypixel Crop Mutations Design', CANVAS_WIDTH / 2, 30)

    // Draw grid
    for (let row = 0; row < GRID_SIZE; row++) {
        for (let col = 0; col < GRID_SIZE; col++) {
            const x = PADDING + col * CELL_SIZE
            const y = PADDING + 40 + row * CELL_SIZE
            const cell = grid[row][col]

            // Cell background
            if (cell.type === 'locked') {
                ctx.fillStyle = '#27272a'
            } else if (cell.type === 'empty') {
                ctx.fillStyle = '#18181b'
            } else if (cell.type === 'mutation') {
                ctx.fillStyle = '#3b0764'
            } else if (cell.type === 'crop') {
                ctx.fillStyle = '#1e3a8a'
            }

            ctx.fillRect(x, y, CELL_SIZE - 2, CELL_SIZE - 2)

            // Cell border
            ctx.strokeStyle = cell.type === 'locked' ? '#3f3f46' : '#52525b'
            ctx.lineWidth = 2
            ctx.strokeRect(x, y, CELL_SIZE - 2, CELL_SIZE - 2)

            // Cell content
            if (cell.type === 'mutation' && cell.mutationId) {
                const mutation = MUTATIONS_DATA[cell.mutationId]
                if (mutation) {
                    ctx.fillStyle = '#ffffff'
                    ctx.font = '10px Inter, sans-serif'
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'

                    // Wrap mutation name
                    const words = mutation.name.split(' ')
                    const lines: string[] = []
                    let currentLine = ''

                    for (const word of words) {
                        const testLine = currentLine ? `${currentLine} ${word}` : word
                        const metrics = ctx.measureText(testLine)

                        if (metrics.width > CELL_SIZE - 10 && currentLine) {
                            lines.push(currentLine)
                            currentLine = word
                        } else {
                            currentLine = testLine
                        }
                    }
                    if (currentLine) lines.push(currentLine)

                    const lineHeight = 12
                    const startY = y + CELL_SIZE / 2 - ((lines.length - 1) * lineHeight) / 2

                    lines.forEach((line, i) => {
                        ctx.fillText(line, x + CELL_SIZE / 2, startY + i * lineHeight)
                    })
                }
            } else if (cell.type === 'crop' && cell.cropType) {
                const emoji = CROP_EMOJIS[cell.cropType]
                if (emoji) {
                    ctx.font = '32px Arial'
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(emoji, x + CELL_SIZE / 2, y + CELL_SIZE / 2)
                } else {
                    // Fallback text
                    ctx.fillStyle = '#ffffff'
                    ctx.font = '10px Inter, sans-serif'
                    ctx.textAlign = 'center'
                    ctx.textBaseline = 'middle'
                    ctx.fillText(cell.cropType, x + CELL_SIZE / 2, y + CELL_SIZE / 2)
                }
            }
        }
    }

    return canvas
}

export async function gridToDataURL(grid: CustomDesignGrid): Promise<string> {
    const canvas = await renderGridToCanvas(grid)
    return canvas.toDataURL('image/png')
}

export async function gridToBlob(grid: CustomDesignGrid): Promise<Blob> {
    const canvas = await renderGridToCanvas(grid)
    return new Promise((resolve) => {
        canvas.toBlob((blob) => {
            resolve(blob!)
        }, 'image/png')
    })
}

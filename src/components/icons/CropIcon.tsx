import type { BaseCrop } from '@types'
import {CROP_EMOJIS} from "@data/constants.ts";

interface CropIconProps {
    crop: BaseCrop | string
    size?: 'small' | 'medium' | 'large'
    className?: string
}

// Map crop IDs to image filenames
const cropIdToFilename = (cropId: string): string => {
    const mapping: Record<string, string> = {
        'wheat': 'Wheat',
        'potato': 'Potato',
        'carrot': 'Carrot',
        'pumpkin': 'Pumpkin',
        'melon': 'Melon_Slice',
        'cocoa_beans': 'Cocoa_Beans',
        'sugar_cane': 'Sugar_Cane',
        'cactus': 'Cactus',
        'nether_wart': 'Nether_Wart',
        'red_mushroom': 'Red_Mushroom',
        'brown_mushroom': 'Brown_Mushroom',
        'moonflower': 'Blue_Orchid',
        'sunflower': 'Sunflower',
        'wild_rose': 'Rose_Bush',
    }
    return mapping[cropId] || cropId
}

// Dynamic webp imports
const cropIcons: Record<string, string> = {}

// Import all crop webp images
try {
    const modules = import.meta.glob('@/assets/crops/*.webp', { eager: true, query: '?url', import: 'default' })
    Object.entries(modules).forEach(([path, url]) => {
        const filename = path.split('/').pop()?.replace('.webp', '')
        if (filename) {
            cropIcons[filename] = url as string
        }
    })
} catch (error) {
    console.warn('No crop webp images found.')
}

export function CropIcon({ crop, size = 'medium', className = '' }: CropIconProps) {
    const sizeClasses = {
        small: 'w-4 h-4',
        medium: 'w-6 h-6',
        large: 'w-8 h-8',
    }

    const filename = cropIdToFilename(crop)
    const imageUrl = cropIcons[filename]

    // If image exists, use it
    if (imageUrl) {
        return (
            <img
                src={imageUrl}
                alt={crop}
                className={`${sizeClasses[size]} object-contain ${className}`}
                style={{
                    filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.2))',
                    imageRendering: 'crisp-edges'
                }}
            />
        )
    }

    const emoji = CROP_EMOJIS[crop as BaseCrop] || '🌱'
    const emojiSize = {
        small: 'text-sm',
        medium: 'text-lg',
        large: 'text-2xl',
    }

    return (
        <span className={`${emojiSize[size]} ${className}`} role="img" aria-label={crop}>
            {emoji}
        </span>
    )
}

// Utility to check if a crop has an image
export function hasCropIcon(crop: BaseCrop | string): boolean {
    const filename = cropIdToFilename(crop)
    return filename in cropIcons
}

// Export for use in other components
export { cropIcons }

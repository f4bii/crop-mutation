interface MutationIconProps {
    mutationId: string
    mutationName: string
    fallbackIcon?: string
    size?: 'small' | 'medium' | 'large' | 'xl'
    className?: string
}

// Map mutation IDs to image filenames
const mutationIdToFilename = (id: string, name: string): string => {
    // Special cases with exact filename mapping
    const specialCases: Record<string, string> = {
        'do_not_eat_shroom': 'Do-not-eat-shroom',
        'magic_jellybean': 'Magic_Jellybean',
        'plantboy_advance': 'PlantBoy_Advance',
        'all_in_aloe': 'All-in_Aloe',
        'stoplight_petal': 'Stoplight_Petal',
        'chorus_fruit': 'Chorus_Fruit',
        'mantid_claw': 'Mantid_Claw',
    }

    // Check if it's a special case
    if (specialCases[id]) {
        return specialCases[id]
    }

    // Default: use the mutation name directly (which is already capitalized)
    return name
}

// Dynamic webp imports
const mutationImages: Record<string, string> = {}

// Import all mutation webp images
try {
    const modules = import.meta.glob('@/assets/crops/*.webp', { eager: true, query: '?url', import: 'default' })
    Object.entries(modules).forEach(([path, url]) => {
        const filename = path.split('/').pop()?.replace('.webp', '')
        if (filename) {
            mutationImages[filename] = url as string
        }
    })
} catch (error) {
    console.warn('No mutation webp images found. Using emoji fallback.')
}

export function MutationIcon({
    mutationId,
    mutationName,
    fallbackIcon = '❓',
    size = 'medium',
    className = ''
}: MutationIconProps) {
    const sizeClasses = {
        small: 'w-6 h-6',
        medium: 'w-12 h-12',
        large: 'w-16 h-16',
        xl: 'w-20 h-20',
    }

    const filename = mutationIdToFilename(mutationId, mutationName)
    const imageUrl = mutationImages[filename]

    // If image exists, use it
    if (imageUrl) {
        return (
            <img
                src={imageUrl}
                alt={mutationName}
                className={`${sizeClasses[size]} object-contain ${className}`}
                style={{
                    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                    imageRendering: 'crisp-edges'
                }}
            />
        )
    }

    // Fallback to emoji
    const emojiSize = {
        small: 'text-2xl',
        medium: 'text-4xl',
        large: 'text-5xl',
        xl: 'text-6xl',
    }

    return (
        <span className={`${emojiSize[size]} ${className}`} role="img" aria-label={mutationName}>
            {fallbackIcon}
        </span>
    )
}

// Utility to check if a mutation has an image
export function hasMutationIcon(mutationId: string, mutationName: string): boolean {
    const filename = mutationIdToFilename(mutationId, mutationName)
    return filename in mutationImages
}

// Export for debugging
export { mutationImages }

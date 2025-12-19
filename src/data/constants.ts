import type {BaseCrop, ExtraCondition, CropEmojis, CropGroundRequirements, TierColor} from '@types';

export const BASE_CROPS: BaseCrop[] = [
    'wheat', 'potato', 'carrot', 'pumpkin', 'melon', 'cocoa_beans', 'sugar_cane',
    'cactus', 'nether_wart', 'red_mushroom', 'brown_mushroom', 'moonflower', 'sunflower', 'wild_rose'
];

export const EXTRA_CONDITIONS: ExtraCondition[] = ['fire', 'dead_plant', 'fermento'];

export const CROP_EMOJIS: CropEmojis = {
    'fire': '🔥', 'dead_plant': '🥀', 'fermento': '🧪'
};

export const CROP_GROUND_REQUIREMENTS: CropGroundRequirements = {
    'wheat': 'farmland',
    'potato': 'farmland',
    'carrot': 'farmland',
    'pumpkin': 'farmland',
    'melon': 'farmland',
    'cocoa_beans': 'farmland',
    'sugar_cane': 'farmland',
    'cactus': 'sand',
    'nether_wart': 'soul_sand',
    'red_mushroom': 'mycelium',
    'brown_mushroom': 'mycelium',
    'moonflower': 'farmland',
    'sunflower': 'farmland',
    'wild_rose': 'farmland',
    'fire': 'any',
    'dead_plant': 'any',
    'fermento': 'any'
};

export const TIER_COLORS: TierColor[] = [
    {bg: 'from-emerald-500/20 to-emerald-600/20', border: 'border-emerald-500/50', glow: 'shadow-emerald-500/20'},
    {bg: 'from-sky-500/20 to-sky-600/20', border: 'border-sky-500/50', glow: 'shadow-sky-500/20'},
    {bg: 'from-violet-500/20 to-violet-600/20', border: 'border-violet-500/50', glow: 'shadow-violet-500/20'},
    {bg: 'from-orange-500/20 to-orange-600/20', border: 'border-orange-500/50', glow: 'shadow-orange-500/20'},
    {bg: 'from-rose-500/20 to-rose-600/20', border: 'border-rose-500/50', glow: 'shadow-rose-500/20'},
    {bg: 'from-amber-400/20 to-yellow-500/20', border: 'border-amber-400/50', glow: 'shadow-amber-400/20'}
];

// Initialize default 12 slots in the correct pattern
export const getDefaultUnlockedSlots = (): Set<string> => {
    return new Set([
        "3,4",
        "3,5",
        "4,3",
        "4,4",
        "4,5",
        "4,6",
        "5,3",
        "5,4",
        "5,5",
        "5,6",
        "6,4",
        "6,5",
    ])
};

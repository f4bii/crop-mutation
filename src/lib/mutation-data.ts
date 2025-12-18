import { MUTATIONS_DATA } from '@data/mutationsData';
import { MUTATION_TIERS } from '@utils/tierUtils';
import type { MutationData as RawMutationData } from '@types';

// Mutation icons mapping
const MUTATION_ICONS: Record<string, string> = {
  ashwreath: '🌋',
  choconut: '🥥',
  dustgrain: '🌾',
  gloomgourd: '🎃',
  lonelily: '🌺',
  scourroot: '🥕',
  shadevine: '🌿',
  veilshroom: '🍄',
  witherbloom: '🥀',
  chocoberry: '🫐',
  cindershade: '🔥',
  coalroot: '⚫',
  creambloom: '🌼',
  duskbloom: '🌸',
  thornshade: '🌹',
  blastberry: '💥',
  cheesebite: '🧀',
  chloronite: '💚',
  do_not_eat_shroom: '☠️',
  fleshtrap: '🪤',
  magic_jellybean: '✨',
  noctilume: '🌙',
  snoozling: '😴',
  soggybud: '💧',
  chorus_fruit: '🟣',
  plantboy_advance: '🎮',
  puffercloud: '☁️',
  shellfruit: '🐚',
  startlevine: '⭐',
  stoplight_petal: '🚦',
  thunderling: '⚡',
  turtlellini: '🐢',
  zombud: '🧟',
  all_in_aloe: '🌵',
  devourer: '👹',
  glasscorn: '🌽',
  jerryflower: '🎉',
  godseed: '👑',
  phantomleaf: '👻',
  timestalk: '⏰',
};

export interface MutationData {
  id: string;
  name: string;
  icon: string;
  tier: number;
  ground: string;
  requirements: Array<{ plant: string; count: number }>;
  size: string;
}

function transformMutationData(id: string, raw: RawMutationData): MutationData {
  const requirements: Array<{ plant: string; count: number }> = [];
  if (id === 'godseed') {
    raw = {
      name: "Godseed",
      size: "3x3",
      ground: "farmland",
      drops: null,
      effects: [
        "improved_harvest_boost", "improved_water_retain", "improved_xp_boost", "immunity", "bonus_drops", "improved_effect_spread"
      ],
      conditions: { special: "all_positive_crop_effects" },
    }
  }

  // Transform conditions into requirements array
  Object.entries(raw.conditions).forEach(([key, value]) => {
    if (key !== 'special' && key !== 'adjacent_crops' && typeof value === 'number') {
      requirements.push({ plant: key, count: value });
    }
  });

  return {
    id,
    name: raw.name,
    icon: MUTATION_ICONS[id] || '❓',
    tier: MUTATION_TIERS[id] || 0,
    ground: raw.ground,
    requirements,
    size: raw.size,
  };
}

// Export all mutations in the transformed format
export const allMutations: MutationData[] = Object.entries(MUTATIONS_DATA).map(([id, data]) =>
  transformMutationData(id, data)
);

// Helper to get a single mutation by id
export function getMutation(id: string): MutationData | undefined {
  const raw = MUTATIONS_DATA[id];
  if (!raw) return undefined;
  return transformMutationData(id, raw);
}

import {MutationData, MutationsData} from '@types';

export const MUTATIONS_DATA: MutationsData = {
    "ashwreath": { "name": "Ashwreath", "size": "1x1", "ground": "soul_sand", "drops": { "nether_wart": 1200 }, "effects": ["improved_harvest_boost", "xp_loss"], "conditions": { "nether_wart": 4, "fire": 4 } },
    "choconut": { "name": "Choconut", "size": "1x1", "ground": "farmland", "drops": { "cocoa_beans": 800 }, "effects": ["immunity"], "conditions": { "cocoa_beans": 4 } },
    "dustgrain": { "name": "Dustgrain", "size": "1x1", "ground": "farmland", "drops": { "wheat": 400 }, "effects": ["harvest_boost"], "conditions": { "wheat": 4 } },
    "gloomgourd": { "name": "Gloomgourd", "size": "1x1", "ground": "farmland", "drops": { "pumpkin": 170, "melon_slice": 800 }, "effects": ["water_retain", "bonus_drops"], "conditions": { "pumpkin": 1, "melon": 1 } },
    "lonelily": { "name": "Lonelily", "size": "1x1", "ground": "farmland", "drops": { "potato": 600, "carrot": 700, "pumpkin": 340 }, "effects": ["bonus_drops"], "conditions": { "adjacent_crops": 0 } },
    "scourroot": { "name": "Scourroot", "size": "1x1", "ground": "farmland", "drops": { "potato": 600, "carrot": 700 }, "effects": ["immunity", "xp_boost"], "conditions": { "potato": 2, "carrot": 2 } },
    "shadevine": { "name": "Shadevine", "size": "1x1", "ground": "farmland", "drops": { "cactus": 300, "sugar_cane": 400 }, "effects": ["improved_water_retain", "improved_xp_boost", "harvest_loss"], "conditions": { "cactus": 2, "sugar_cane": 2 } },
    "veilshroom": { "name": "Veilshroom", "size": "1x1", "ground": "mycelium", "drops": { "brown_mushroom": 190, "red_mushroom": 190 }, "effects": ["improved_harvest_boost", "water_drain"], "conditions": { "red_mushroom": 2, "brown_mushroom": 2 } },
    "witherbloom": { "name": "Witherbloom", "size": "1x1", "ground": "soul_sand", "drops": { "wild_rose": 1600 }, "effects": ["effect_spread"], "conditions": { "dead_plant": 8 } },
    "chocoberry": { "name": "Chocoberry", "size": "1x1", "ground": "farmland", "drops": { "cocoa_beans": 400, "pumpkin": 170, "melon_slice": 1600 }, "effects": ["water_retain"], "conditions": { "choconut": 6, "gloomgourd": 2 } },
    "cindershade": { "name": "Cindershade", "size": "1x1", "ground": "soul_sand", "drops": { "nether_wart": 1200, "wild_rose": 800 }, "effects": ["effect_spread", "improved_harvest_boost", "xp_loss"], "conditions": { "ashwreath": 4, "witherbloom": 4 } },
    "coalroot": { "name": "Coalroot", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["xp_boost"], "conditions": { "ashwreath": 5, "scourroot": 3 } },
    "creambloom": { "name": "Creambloom", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["immunity"], "conditions": { "choconut": 8 } },
    "duskbloom": { "name": "Duskbloom", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["bonus_drops"], "conditions": { "moonflower": 2, "shadevine": 2, "sunflower": 2, "dustgrain": 2 } },
    "thornshade": { "name": "Thornshade", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["effect_spread"], "conditions": { "wild_rose": 4, "veilshroom": 4 } },
    "blastberry": { "name": "Blastberry", "size": "1x1", "ground": "sand", "drops": null, "effects": ["immunity", "improved_harvest_boost", "xp_loss"], "conditions": { "chocoberry": 5, "ashwreath": 3 } },
    "cheesebite": { "name": "Cheesebite", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["improved_water_retain"], "conditions": { "creambloom": 4, "fermento": 4 } },
    "chloronite": { "name": "Chloronite", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["immunity"], "conditions": { "coalroot": 6, "thornshade": 2 } },
    "do_not_eat_shroom": { "name": "Do-not-eat-shroom", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["improved_harvest_boost", "water_drain"], "conditions": { "veilshroom": 4, "scourroot": 4 } },
    "fleshtrap": { "name": "Fleshtrap", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["bonus_drops"], "conditions": { "cindershade": 4, "lonelily": 4 } },
    "magic_jellybean": { "name": "Magic Jellybean", "size": "1x1", "ground": "sand", "drops": null, "effects": ["improved_xp_boost", "harvest_loss"], "conditions": { "sugar_cane": 5, "duskbloom": 3 } },
    "noctilume": { "name": "Noctilume", "size": "2x2", "ground": "farmland", "drops": null, "effects": ["effect_spread", "improved_water_retain", "harvest_loss"], "conditions": { "duskbloom": 6, "lonelily": 2 } },
    "snoozling": { "name": "Snoozling", "size": "3x3", "ground": "farmland", "drops": null, "effects": ["bonus_drops"], "conditions": { "creambloom": 4, "dustgrain": 3, "witherbloom": 3, "duskbloom": 3, "thornshade": 3 } },
    "soggybud": { "name": "Soggybud", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["water_retain"], "conditions": { "melon": 8 } },
    "chorus_fruit": { "name": "Chorus Fruit", "size": "1x1", "ground": "end_stone", "drops": null, "effects": ["improved_xp_boost", "harvest_loss"], "conditions": { "chloronite": 5, "magic_jellybean": 3 } },
    "plantboy_advance": { "name": "PlantBoy Advance", "size": "2x2", "ground": "farmland", "drops": null, "effects": ["harvest_boost"], "conditions": { "snoozling": 6, "thunderling": 6 } },
    "puffercloud": { "name": "Puffercloud", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["improved_harvest_boost", "water_drain"], "conditions": { "snoozling": 2, "do_not_eat_shroom": 6 } },
    "shellfruit": { "name": "Shellfruit", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["water_retain", "immunity"], "conditions": { "special": "explode_turtlellini_with_blastberry" } },
    "startlevine": { "name": "Startlevine", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["improved_water_retain", "improved_xp_boost", "harvest_loss"], "conditions": { "blastberry": 4, "cheesebite": 4 } },
    "stoplight_petal": { "name": "Stoplight Petal", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["effect_spread", "improved_water_retain", "harvest_loss"], "conditions": { "snoozling": 4, "noctilume": 4 } },
    "thunderling": { "name": "Thunderling", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["effect_spread"], "conditions": { "soggybud": 5, "noctilume": 3 } },
    "turtlellini": { "name": "Turtlellini", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["water_retain", "immunity"], "conditions": { "soggybud": 4, "choconut": 4 } },
    "zombud": { "name": "Zombud", "size": "1x1", "ground": "soul_sand", "drops": null, "effects": ["effect_spread", "bonus_drops"], "conditions": { "dead_plant": 4, "cindershade": 2, "fleshtrap": 2 } },
    "all_in_aloe": { "name": "All-in Aloe", "size": "1x1", "ground": "sand", "drops": null, "effects": ["harvest_boost"], "conditions": { "magic_jellybean": 6, "plantboy_advance": 2 } },
    "devourer": { "name": "Devourer", "size": "1x1", "ground": "farmland", "drops": null, "effects": ["bonus_drops", "improved_harvest_boost", "water_drain"], "conditions": { "puffercloud": 4, "zombud": 4 } },
    "glasscorn": { "name": "Glasscorn", "size": "2x2", "ground": "sand", "drops": null, "effects": ["immunity", "improved_water_retain", "harvest_loss"], "conditions": { "startlevine": 6, "chloronite": 6 } },
    "jerryflower": { "name": "Jerryflower", "size": "1x1", "ground": "farmland", "drops": null, "effects": [], "conditions": { "special": "grow_the_jerryseed" } },
    "godseed": { "name": "Godseed", "size": "3x3", "ground": "farmland", "drops": null, "effects": ["improved_harvest_boost", "improved_water_retain", "improved_xp_boost", "immunity", "bonus_drops", "improved_effect_spread"], "conditions": { "special": "all_positive_crop_effects" } },
    "phantomleaf": { "name": "Phantomleaf", "size": "1x1", "ground": "soul_sand", "drops": null, "effects": ["xp_boost", "immunity"], "conditions": { "chorus_fruit": 4, "shellfruit": 4 } },
    "timestalk": { "name": "Timestalk", "size": "1x1", "ground": "soul_sand", "drops": null, "effects": ["improved_water_retain", "improved_xp_boost", "harvest_loss"], "conditions": { "stoplight_petal": 4, "chorus_fruit": 2, "shellfruit": 2 } }
};

export const getMutationData = (id: string): MutationData => {
    if (id === 'godseed') {
        return {
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
    return MUTATIONS_DATA[id];
}
import type { OptimizerState, ObjectiveType } from '@types';
import { getMutationData } from '@data/mutationsData';
import { MUTATION_TIERS } from '@utils/tierUtils';
import { parseSize } from './geometry';

/**
 * Effect weights for profit calculation
 */
const EFFECT_WEIGHTS: Record<string, number> = {
  // Positive effects
  'improved_harvest_boost': 100,
  'harvest_boost': 60,
  'improved_water_retain': 40,
  'water_retain': 25,
  'improved_xp_boost': 35,
  'xp_boost': 20,
  'immunity': 80,
  'bonus_drops': 70,
  'improved_effect_spread': 50,
  'effect_spread': 30,

  // Negative effects (penalties)
  'harvest_loss': -40,
  'water_drain': -30,
  'xp_loss': -20
};

/**
 * Calculate score for MAX_MUTATIONS objective
 * Formula: Σ (1 + tier * 0.25 + area * 0.1)
 */
export function calculateMutationsScore(state: OptimizerState): number {
  let score = 0;

  for (const [, placedMutation] of state.placedMutations) {
    const mutation = getMutationData(placedMutation.mutationId);
    if (!mutation) continue;

    const tier = MUTATION_TIERS[placedMutation.mutationId] || 0;
    const { width, height } = parseSize(mutation.size);
    const area = width * height;

    // Base score: 1 per mutation
    // Tier bonus: higher tier mutations are more valuable
    // Area penalty: larger mutations take more space, so slightly lower per-cell value
    score += 1 + (tier * 0.25) + (area * 0.1);
  }

  return score;
}

/**
 * Calculate score for MAX_PROFIT objective
 * Formula: Σ baseDrops + Σ effectBonuses - Σ penalties
 */
export function calculateProfitScore(state: OptimizerState): number {
  let score = 0;

  for (const [, placedMutation] of state.placedMutations) {
    const mutation = getMutationData(placedMutation.mutationId);
    if (!mutation) continue;

    // Add drop values
    if (mutation.drops) {
      for (const [, amount] of Object.entries(mutation.drops)) {
        score += amount * 0.01; // Scale down raw drop amounts
      }
    }

    // Add effect bonuses/penalties
    for (const effect of mutation.effects) {
      const weight = EFFECT_WEIGHTS[effect] || 0;
      score += weight;
    }

    // Tier bonus for profit (higher tier = more valuable in-game)
    const tier = MUTATION_TIERS[placedMutation.mutationId] || 0;
    score += tier * 10;
  }

  return score;
}

/**
 * Calculate score based on objective type
 */
export function calculateScore(state: OptimizerState, objectiveType: ObjectiveType): number {
  switch (objectiveType) {
    case 'MAX_MUTATIONS':
      return calculateMutationsScore(state);
    case 'MAX_PROFIT':
      return calculateProfitScore(state);
    default:
      return calculateMutationsScore(state);
  }
}

/**
 * Get detailed score breakdown for UI display
 */
export function getScoreBreakdown(state: OptimizerState): {
  mutationCount: number;
  cropCount: number;
  totalDrops: number;
  positiveEffects: number;
  negativeEffects: number;
  tierBreakdown: Record<number, number>;
} {
  let totalDrops = 0;
  let positiveEffects = 0;
  let negativeEffects = 0;
  const tierBreakdown: Record<number, number> = {};

  for (const [, placedMutation] of state.placedMutations) {
    const mutation = getMutationData(placedMutation.mutationId);
    if (!mutation) continue;

    // Count drops
    if (mutation.drops) {
      for (const [, amount] of Object.entries(mutation.drops)) {
        totalDrops += amount;
      }
    }

    // Count effects
    for (const effect of mutation.effects) {
      const weight = EFFECT_WEIGHTS[effect] || 0;
      if (weight > 0) {
        positiveEffects++;
      } else if (weight < 0) {
        negativeEffects++;
      }
    }

    // Count by tier
    const tier = MUTATION_TIERS[placedMutation.mutationId] || 0;
    tierBreakdown[tier] = (tierBreakdown[tier] || 0) + 1;
  }

  return {
    mutationCount: state.placedMutations.size,
    cropCount: state.placedCrops.size,
    totalDrops,
    positiveEffects,
    negativeEffects,
    tierBreakdown
  };
}

import { describe, it, expect, beforeEach } from 'vitest';
import { reducer } from '../store/StoreContext';
import {
  calculateDailyNutritionTotals,
  calculateCalorieBalance,
  calculateMacroCaloricDistribution,
  calculateMealItemTotals,
} from '../utils/nutritionCalculations';

describe('Stage 4 — Workout & Nutrition Engine Verification', () => {
  it('correctly recalculates meal calories and macros proportionally when servings change', () => {
    const rawFood = {
      name: 'Paneer Butter Masala',
      calories: 320,
      protein: 14,
      carbs: 12,
      fat: 24,
    };

    // 1 serving
    const singleServing = calculateMealItemTotals({ ...rawFood, servings: 1 });
    expect(singleServing.calories).toBe(320);
    expect(singleServing.protein).toBe(14);
    expect(singleServing.carbs).toBe(12);
    expect(singleServing.fat).toBe(24);

    // 1.5 servings
    const oneAndHalf = calculateMealItemTotals({ ...rawFood, servings: 1.5 });
    expect(oneAndHalf.calories).toBe(480);
    expect(oneAndHalf.protein).toBe(21);
    expect(oneAndHalf.carbs).toBe(18);
    expect(oneAndHalf.fat).toBe(36);

    // Macro caloric distribution: 4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat
    const macroDist = calculateMacroCaloricDistribution(
      oneAndHalf.protein,
      oneAndHalf.carbs,
      oneAndHalf.fat
    );
    expect(macroDist.totalMacroCals).toBe(21 * 4 + 18 * 4 + 36 * 9); // 84 + 72 + 324 = 480
    expect(macroDist.proteinPct).toBe(18);
    expect(macroDist.carbsPct).toBe(15);
    expect(macroDist.fatPct).toBe(68);
    expect(macroDist.proteinPct + macroDist.carbsPct + macroDist.fatPct).toBeGreaterThanOrEqual(99);
    expect(macroDist.proteinPct + macroDist.carbsPct + macroDist.fatPct).toBeLessThanOrEqual(101);
  });

  it('preserves nutrition target history per date when daily targets are edited', () => {
    const initialState = {
      preferences: {
        nutritionTargets: { calories: 2200, protein: 150, carbs: 220, fat: 70 },
      },
      nutritionTargetHistory: {
        '2026-10-30': { calories: 2000, protein: 140, carbs: 200, fat: 65 },
      },
    };

    // User updates targets specifically for today (2026-10-31)
    const nextState = reducer(initialState, {
      type: 'SET_NUTRITION_TARGETS',
      payload: {
        date: '2026-10-31',
        targets: { calories: 2500, protein: 175, carbs: 250, fat: 80 },
      },
    });

    // Current preference updated
    expect(nextState.preferences.nutritionTargets.calories).toBe(2500);

    // Historical date target is preserved untouched!
    expect(nextState.nutritionTargetHistory['2026-10-30'].calories).toBe(2000);

    // Today's target recorded in history
    expect(nextState.nutritionTargetHistory['2026-10-31'].calories).toBe(2500);
  });

  it('verifies calorie balance calculations (surplus, deficit, maintenance)', () => {
    // Deficit: target 2200, consumed 1800 -> remaining 400, not over
    const deficit = calculateCalorieBalance(2200, 1800);
    expect(deficit.target).toBe(2200);
    expect(deficit.consumed).toBe(1800);
    expect(deficit.remaining).toBe(400);
    expect(deficit.isOver).toBe(false);
    expect(deficit.overAmount).toBe(0);
    expect(deficit.percent).toBe(82);

    // Surplus: target 2200, consumed 2600 -> remaining -400, isOver true, overAmount 400
    const surplus = calculateCalorieBalance(2200, 2600);
    expect(surplus.target).toBe(2200);
    expect(surplus.consumed).toBe(2600);
    expect(surplus.remaining).toBe(-400);
    expect(surplus.isOver).toBe(true);
    expect(surplus.overAmount).toBe(400);
    expect(surplus.percent).toBe(118);

    // Maintenance: target 2200, consumed 2200 -> remaining 0, isOver false
    const maintenance = calculateCalorieBalance(2200, 2200);
    expect(maintenance.remaining).toBe(0);
    expect(maintenance.isOver).toBe(false);
    expect(maintenance.overAmount).toBe(0);
    expect(maintenance.percent).toBe(100);
  });
});

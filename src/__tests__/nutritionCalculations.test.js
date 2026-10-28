import { describe, it, expect } from 'vitest';
import {
  calculateMealItemTotals,
  calculateDailyNutritionTotals,
  calculateCalorieBalance,
  calculateMacroCaloricDistribution,
  getNutritionTargetsForDate,
  validateMealInput,
  DEFAULT_NUTRITION_TARGETS,
} from '../utils/nutritionCalculations';

describe('Shared Nutrition Calculation Utility', () => {
  it('correctly calculates meal item totals with fractional servings', () => {
    const item = {
      servings: 1.5,
      calories: 200,
      protein: 20,
      carbs: 10,
      fat: 5,
    };
    const totals = calculateMealItemTotals(item);
    expect(totals.calories).toBe(300);
    expect(totals.protein).toBe(30);
    expect(totals.carbs).toBe(15);
    expect(totals.fat).toBe(7.5);
  });

  it('safely handles missing or corrupt numeric properties without throwing NaN', () => {
    const corruptItem = {
      servings: 'invalid',
      calories: undefined,
      protein: null,
      carbs: -10, // negative clamped to 0
      fat: 'not-a-number',
    };
    const totals = calculateMealItemTotals(corruptItem);
    expect(totals.calories).toBe(0);
    expect(totals.protein).toBe(0);
    expect(totals.carbs).toBe(0);
    expect(totals.fat).toBe(0);
    expect(totals.servings).toBe(1);
  });

  it('aggregates daily totals correctly across multiple meal entries', () => {
    const meals = [
      { date: '2026-10-26', servings: 2, calories: 150, protein: 10, carbs: 20, fat: 3 },
      { date: '2026-10-26', servings: 1, calories: 400, protein: 35, carbs: 45, fat: 12 },
      { date: '2026-10-25', servings: 1, calories: 500, protein: 30, carbs: 50, fat: 15 }, // different date
    ];

    const todayTotals = calculateDailyNutritionTotals(meals, '2026-10-26');
    expect(todayTotals.calories).toBe(700);
    expect(todayTotals.protein).toBe(55);
    expect(todayTotals.carbs).toBe(85);
    expect(todayTotals.fat).toBe(18);
    expect(todayTotals.mealCount).toBe(2);
  });

  it('calculates remaining calories and handles over-target scenarios accurately', () => {
    const under = calculateCalorieBalance(2200, 1800);
    expect(under.remaining).toBe(400);
    expect(under.percent).toBe(82);
    expect(under.isOver).toBe(false);
    expect(under.overAmount).toBe(0);

    const over = calculateCalorieBalance(2000, 2350);
    expect(over.remaining).toBe(-350);
    expect(over.percent).toBe(118);
    expect(over.isOver).toBe(true);
    expect(over.overAmount).toBe(350);
  });

  it('calculates macro percentage distribution using standard 4-4-9 caloric multipliers', () => {
    // 50g protein = 200 kcal, 50g carbs = 200 kcal, 22.22g fat ~ 200 kcal -> total 600 kcal (33% each)
    const dist = calculateMacroCaloricDistribution(50, 50, 22.22);
    expect(dist.proteinPct).toBe(33);
    expect(dist.carbsPct).toBe(33);
    expect(dist.fatPct).toBe(33);
  });

  it('ensures changing today target does not rewrite historical food logs or target history', () => {
    const mockState = {
      preferences: {
        nutritionTargets: { calories: 2400, protein: 180, carbs: 280, fat: 80 },
      },
      nutritionTargetHistory: {
        '2026-10-20': { calories: 1800, protein: 120, carbs: 200, fat: 60 },
      },
    };

    // Historical date query must return historical target
    const histTarget = getNutritionTargetsForDate(mockState, '2026-10-20');
    expect(histTarget.calories).toBe(1800);
    expect(histTarget.protein).toBe(120);
    expect(histTarget.isHistorical).toBe(true);

    // Today query must return today target
    const todayTarget = getNutritionTargetsForDate(mockState, '2026-10-26');
    expect(todayTarget.calories).toBe(2400);
    expect(todayTarget.protein).toBe(180);
    expect(todayTarget.isHistorical).toBe(false);
  });

  it('validates meal inputs and rejects empty names or negative values', () => {
    const invalid = validateMealInput({
      foodName: '   ',
      servings: -1,
      calories: -50,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
    expect(invalid.isValid).toBe(false);
    expect(invalid.errors.foodName).toBeDefined();
    expect(invalid.errors.servings).toBeDefined();
    expect(invalid.errors.calories).toBeDefined();

    const valid = validateMealInput({
      foodName: 'Dal Tadka',
      servings: 1.5,
      calories: 154,
      protein: 7.2,
      carbs: 21.6,
      fat: 4.2,
    });
    expect(valid.isValid).toBe(true);
    expect(Object.keys(valid.errors).length).toBe(0);
  });
});

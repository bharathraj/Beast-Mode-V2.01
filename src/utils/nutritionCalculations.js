/**
 * Centralized, single shared calculation utility for all nutrition and macro calculations.
 * Ensures identical math, rounding, and compliance metrics across:
 * - NutritionPage
 * - HomePage (Dashboard summaries)
 * - ReviewPage
 * - InsightsPage
 * - TransformationReportModal
 */

export const DEFAULT_NUTRITION_TARGETS = {
  calories: 2200,
  protein: 150,
  carbs: 250,
  fat: 70,
};

/**
 * Calculates raw or scaled values for a single meal entry.
 * Safely guards against non-numeric or missing values.
 */
export function calculateMealItemTotals(item) {
  if (!item || typeof item !== 'object') {
    return { calories: 0, protein: 0, carbs: 0, fat: 0, servings: 1 };
  }

  const servings = Math.max(0.01, parseFloat(item.servings) || 1);
  const baseCalories = Math.max(0, parseFloat(item.calories) || 0);
  const baseProtein = Math.max(0, parseFloat(item.protein) || 0);
  const baseCarbs = Math.max(0, parseFloat(item.carbs) || 0);
  const baseFat = Math.max(0, parseFloat(item.fat) || 0);

  return {
    servings,
    calories: Math.round(baseCalories * servings),
    protein: Number((baseProtein * servings).toFixed(1)),
    carbs: Number((baseCarbs * servings).toFixed(1)),
    fat: Number((baseFat * servings).toFixed(1)),
  };
}

/**
 * Calculates aggregated daily nutrition totals from a list of meal entries.
 * Can filter by a specific ISO date string (YYYY-MM-DD) or use all provided meals.
 */
export function calculateDailyNutritionTotals(mealEntries = [], dateFilter = null) {
  const meals = Array.isArray(mealEntries) ? mealEntries : [];
  const targetMeals = dateFilter
    ? meals.filter(m => m && m.date === dateFilter)
    : meals;

  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;

  for (const meal of targetMeals) {
    const calculated = calculateMealItemTotals(meal);
    totalCalories += calculated.calories;
    totalProtein += calculated.protein;
    totalCarbs += calculated.carbs;
    totalFat += calculated.fat;
  }

  return {
    calories: Math.round(totalCalories),
    protein: Number(totalProtein.toFixed(1)),
    carbs: Number(totalCarbs.toFixed(1)),
    fat: Number(totalFat.toFixed(1)),
    mealCount: targetMeals.length,
  };
}

/**
 * Calculates calorie targets and remaining balance.
 * Prevents negative targets, handles zero targets safely.
 */
export function calculateCalorieBalance(targetCalories, consumedCalories) {
  const target = Math.max(0, Math.round(parseFloat(targetCalories) || 0));
  const consumed = Math.max(0, Math.round(parseFloat(consumedCalories) || 0));
  const remaining = target - consumed;
  const percent = target > 0 ? Math.min(999, Math.round((consumed / target) * 100)) : 0;
  const isOver = consumed > target;

  return {
    target,
    consumed,
    remaining,
    percent,
    isOver,
    overAmount: isOver ? consumed - target : 0,
  };
}

/**
 * Calculates macro percentage distribution based on 4-4-9 caloric standard:
 * 1g Protein = 4 kcal, 1g Carbs = 4 kcal, 1g Fat = 9 kcal.
 */
export function calculateMacroCaloricDistribution(proteinGrams, carbsGrams, fatGrams) {
  const pG = Math.max(0, parseFloat(proteinGrams) || 0);
  const cG = Math.max(0, parseFloat(carbsGrams) || 0);
  const fG = Math.max(0, parseFloat(fatGrams) || 0);

  const proteinCals = pG * 4;
  const carbsCals = cG * 4;
  const fatCals = fG * 9;
  const totalMacroCals = proteinCals + carbsCals + fatCals;

  if (totalMacroCals === 0) {
    return {
      proteinPct: 0,
      carbsPct: 0,
      fatPct: 0,
      proteinCals: 0,
      carbsCals: 0,
      fatCals: 0,
      totalMacroCals: 0,
    };
  }

  return {
    proteinPct: Math.round((proteinCals / totalMacroCals) * 100),
    carbsPct: Math.round((carbsCals / totalMacroCals) * 100),
    fatPct: Math.round((fatCals / totalMacroCals) * 100),
    proteinCals: Math.round(proteinCals),
    carbsCals: Math.round(carbsCals),
    fatCals: Math.round(fatCals),
    totalMacroCals: Math.round(totalMacroCals),
  };
}

/**
 * Retrieves the nutrition targets for a specific date without modifying historical records.
 * If target history exists for this date, uses it. Otherwise falls back to active preferences.
 */
export function getNutritionTargetsForDate(state, dateStr) {
  const history = state?.nutritionTargetHistory || {};
  if (dateStr && history[dateStr]) {
    return {
      calories: Math.max(500, history[dateStr].calories ?? DEFAULT_NUTRITION_TARGETS.calories),
      protein: Math.max(0, history[dateStr].protein ?? DEFAULT_NUTRITION_TARGETS.protein),
      carbs: Math.max(0, history[dateStr].carbs ?? DEFAULT_NUTRITION_TARGETS.carbs),
      fat: Math.max(0, history[dateStr].fat ?? DEFAULT_NUTRITION_TARGETS.fat),
      isHistorical: true,
    };
  }

  const prefs = state?.preferences?.nutritionTargets || {};
  return {
    calories: Math.max(500, prefs.calories ?? DEFAULT_NUTRITION_TARGETS.calories),
    protein: Math.max(0, prefs.protein ?? DEFAULT_NUTRITION_TARGETS.protein),
    carbs: Math.max(0, prefs.carbs ?? DEFAULT_NUTRITION_TARGETS.carbs),
    fat: Math.max(0, prefs.fat ?? DEFAULT_NUTRITION_TARGETS.fat),
    isHistorical: false,
  };
}

/**
 * Validates meal entry inputs to prevent negative, NaN, or corrupt submissions.
 */
export function validateMealInput(data) {
  const errors = {};

  if (!data.foodName || typeof data.foodName !== 'string' || !data.foodName.trim()) {
    errors.foodName = 'Food name is required';
  }

  const servings = parseFloat(data.servings);
  if (isNaN(servings) || servings <= 0) {
    errors.servings = 'Servings must be a positive number';
  }

  const calories = parseFloat(data.calories);
  if (isNaN(calories) || calories < 0) {
    errors.calories = 'Calories must be 0 or greater';
  }

  const protein = parseFloat(data.protein);
  if (isNaN(protein) || protein < 0) {
    errors.protein = 'Protein must be 0 or greater';
  }

  const carbs = parseFloat(data.carbs);
  if (isNaN(carbs) || carbs < 0) {
    errors.carbs = 'Carbs must be 0 or greater';
  }

  const fat = parseFloat(data.fat);
  if (isNaN(fat) || fat < 0) {
    errors.fat = 'Fat must be 0 or greater';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

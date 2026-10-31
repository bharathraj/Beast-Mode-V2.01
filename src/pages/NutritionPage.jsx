import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/StoreContext';
import { generateId, todayStr } from '../utils/storage';
import { Card, Button, Modal, PageHeader, TabBar, ProgressRing, Badge } from '../components/ui';
import {
  calculateDailyNutritionTotals,
  calculateCalorieBalance,
  calculateMacroCaloricDistribution,
  getNutritionTargetsForDate,
  validateMealInput,
  calculateMealItemTotals,
} from '../utils/nutritionCalculations';
import { cookedIndianFoods } from '../data/indianFoods';
import { searchOpenFoodFacts, lookupBarcode } from '../services/nutritionApi';
import {
  Plus, Utensils, Droplets, Search, Trash2, Coffee,
  UtensilsCrossed, Cookie, Edit3, Target, Barcode,
  Check, AlertCircle, RefreshCw, ExternalLink, Sparkles,
  ChevronRight, Flame
} from 'lucide-react';

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_ICONS = { breakfast: Coffee, lunch: Utensils, dinner: UtensilsCrossed, snack: Cookie };

export default function NutritionPage() {
  const { state, dispatch } = useStore();
  const today = todayStr();

  // Navigation tab
  const [tab, setTab] = useState('meals');

  // Food search & logging state
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [mealType, setMealType] = useState('breakfast');
  const [searchSourceTab, setSearchSourceTab] = useState('all'); // 'all' | 'indian' | 'packaged' | 'custom' | 'barcode'
  const [foodSearch, setFoodSearch] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [servings, setServings] = useState('1');

  // Overridable meal values before adding
  const [customServingSize, setCustomServingSize] = useState('');
  const [overrideCalories, setOverrideCalories] = useState('');
  const [overrideProtein, setOverrideProtein] = useState('');
  const [overrideCarbs, setOverrideCarbs] = useState('');
  const [overrideFat, setOverrideFat] = useState('');

  // Editing existing meal entry
  const [editingMeal, setEditingMeal] = useState(null);
  const [editFoodName, setEditFoodName] = useState('');
  const [editServingSize, setEditServingSize] = useState('');
  const [editServings, setEditServings] = useState('1');
  const [editCalories, setEditCalories] = useState('');
  const [editProtein, setEditProtein] = useState('');
  const [editCarbs, setEditCarbs] = useState('');
  const [editFat, setEditFat] = useState('');
  const [editMealType, setEditMealType] = useState('breakfast');
  const [validationError, setValidationError] = useState('');

  // Target editing modal
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [targetCals, setTargetCals] = useState('2200');
  const [targetProtein, setTargetProtein] = useState('150');
  const [targetCarbs, setTargetCarbs] = useState('250');
  const [targetFat, setTargetFat] = useState('70');

  // Custom food creation modal
  const [showAddFood, setShowAddFood] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customCals, setCustomCals] = useState('');
  const [customProtein, setCustomProtein] = useState('');
  const [customCarbs, setCustomCarbs] = useState('');
  const [customFat, setCustomFat] = useState('');
  const [customServing, setCustomServing] = useState('100g');

  // Barcode search state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');

  // Open Food Facts remote search state
  const [remoteFoods, setRemoteFoods] = useState([]);
  const [isSearchingRemote, setIsSearchingRemote] = useState(false);
  const [remoteSearchSource, setRemoteSearchSource] = useState('');
  const searchTimeoutRef = useRef(null);

  // Water tracking state
  const [waterAmount, setWaterAmount] = useState('250');

  // Get current targets for today using single calculation utility
  const targets = useMemo(() => {
    return getNutritionTargetsForDate(state, today);
  }, [state, today]);

  // Today's meal entries
  const todayMeals = useMemo(() => {
    return (state.mealEntries || []).filter(m => m.date === today);
  }, [state.mealEntries, today]);

  // Daily totals calculated via centralized utility
  const totals = useMemo(() => {
    return calculateDailyNutritionTotals(todayMeals);
  }, [todayMeals]);

  // Calorie balance & remaining
  const balance = useMemo(() => {
    return calculateCalorieBalance(targets.calories, totals.calories);
  }, [targets.calories, totals.calories]);

  // Macro percentages using 4-4-9 distribution
  const macroDist = useMemo(() => {
    return calculateMacroCaloricDistribution(totals.protein, totals.carbs, totals.fat);
  }, [totals.protein, totals.carbs, totals.fat]);

  // Water total and entries
  const todayWater = useMemo(() => {
    return (state.waterEntries || [])
      .filter(w => w.date === today)
      .reduce((sum, w) => sum + (Number(w.amount) || 0), 0);
  }, [state.waterEntries, today]);

  const todayWaterEntries = useMemo(() => {
    return (state.waterEntries || [])
      .filter(w => w.date === today)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [state.waterEntries, today]);

  // Initialize target form values when modal opens
  useEffect(() => {
    if (showTargetModal) {
      setTargetCals(String(targets.calories));
      setTargetProtein(String(targets.protein));
      setTargetCarbs(String(targets.carbs));
      setTargetFat(String(targets.fat));
    }
  }, [showTargetModal, targets]);

  // Remote debounced search to Open Food Facts API v3
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const trimmed = foodSearch.trim();
    if (!trimmed || trimmed.length < 2) {
      setRemoteFoods([]);
      setIsSearchingRemote(false);
      return;
    }

    if (searchSourceTab === 'packaged' || searchSourceTab === 'all') {
      setIsSearchingRemote(true);
      searchTimeoutRef.current = setTimeout(async () => {
        try {
          const res = await searchOpenFoodFacts(trimmed);
          setRemoteFoods(res.products || []);
          setRemoteSearchSource(res.source || 'Open Food Facts');
        } catch (err) {
          console.warn('Open Food Facts search error:', err);
        } finally {
          setIsSearchingRemote(false);
        }
      }, 400); // 400ms debounce
    } else {
      setRemoteFoods([]);
      setIsSearchingRemote(false);
    }

    return () => clearTimeout(searchTimeoutRef.current);
  }, [foodSearch, searchSourceTab]);

  // Combined local & remote foods for picker
  const filteredFoodList = useMemo(() => {
    const q = foodSearch.trim().toLowerCase();

    // 1. Cooked Indian Foods
    const indianList = cookedIndianFoods.filter(f =>
      !q || f.name.toLowerCase().includes(q) || f.category.toLowerCase().includes(q)
    );

    // 2. Custom & sample foods in store
    const storeFoods = (state.foods || []).filter(f =>
      !q || f.name.toLowerCase().includes(q) || (f.category && f.category.toLowerCase().includes(q))
    );

    if (searchSourceTab === 'indian') {
      return indianList;
    }

    if (searchSourceTab === 'packaged') {
      return remoteFoods;
    }

    if (searchSourceTab === 'custom') {
      return storeFoods;
    }

    // Default 'all': Indian first, custom, then remote Open Food Facts
    return [...indianList.slice(0, 15), ...storeFoods, ...remoteFoods.slice(0, 20)];
  }, [foodSearch, searchSourceTab, state.foods, remoteFoods]);

  // Select food to prepare logging
  function handleSelectFood(food) {
    setSelectedFood(food);
    setServings('1');
    setCustomServingSize(food.servingSize || '1 serving');
    setOverrideCalories(food.calories !== null && food.calories !== undefined ? String(food.calories) : '0');
    setOverrideProtein(food.protein !== null && food.protein !== undefined ? String(food.protein) : '0');
    setOverrideCarbs(food.carbs !== null && food.carbs !== undefined ? String(food.carbs) : '0');
    setOverrideFat(food.fat !== null && food.fat !== undefined ? String(food.fat) : '0');
    setValidationError('');
  }

  // Barcode Lookup handler
  async function handleBarcodeLookup() {
    setBarcodeError('');
    if (!barcodeInput.trim()) return;

    setBarcodeLoading(true);
    try {
      const res = await lookupBarcode(barcodeInput);
      if (res.success && res.product) {
        handleSelectFood(res.product);
      } else {
        setBarcodeError(res.error || 'Product not found. Try searching by name or add as custom food.');
      }
    } catch (err) {
      setBarcodeError('Failed to retrieve barcode data. Please check connection.');
    } finally {
      setBarcodeLoading(false);
    }
  }

  // Save targets for today without modifying past history
  function handleSaveTargets() {
    const cals = Math.max(500, parseFloat(targetCals) || 2200);
    const p = Math.max(0, parseFloat(targetProtein) || 150);
    const c = Math.max(0, parseFloat(targetCarbs) || 250);
    const f = Math.max(0, parseFloat(targetFat) || 70);

    dispatch({
      type: 'SET_NUTRITION_TARGETS',
      payload: {
        targets: { calories: Math.round(cals), protein: Math.round(p), carbs: Math.round(c), fat: Math.round(f) },
        date: today,
      },
    });
    setShowTargetModal(false);
  }

  // Log meal entry with input validation
  function handleLogMeal() {
    if (!selectedFood) return;

    const s = parseFloat(servings) || 1;
    const validation = validateMealInput({
      foodName: selectedFood.name,
      servings: s,
      calories: overrideCalories,
      protein: overrideProtein,
      carbs: overrideCarbs,
      fat: overrideFat,
    });

    if (!validation.isValid) {
      setValidationError(Object.values(validation.errors)[0]);
      return;
    }

    dispatch({
      type: 'ADD_MEAL_ENTRY',
      payload: {
        id: generateId(),
        foodId: selectedFood.id,
        foodName: selectedFood.name,
        mealType,
        date: today,
        servings: s,
        servingSize: customServingSize || selectedFood.servingSize,
        calories: Math.max(0, parseFloat(overrideCalories) || 0),
        protein: Math.max(0, parseFloat(overrideProtein) || 0),
        carbs: Math.max(0, parseFloat(overrideCarbs) || 0),
        fat: Math.max(0, parseFloat(overrideFat) || 0),
        source: selectedFood.source || 'Manual Entry',
        barcode: selectedFood.code || null,
        imageUrl: selectedFood.imageUrl || null,
        createdAt: new Date().toISOString(),
      },
    });

    setSelectedFood(null);
    setServings('1');
    setShowAddMeal(false);
  }

  // Open edit modal for logged meal entry
  function handleOpenEditMeal(meal) {
    setEditingMeal(meal);
    setEditFoodName(meal.foodName || '');
    setEditServingSize(meal.servingSize || '1 serving');
    setEditServings(String(meal.servings || 1));
    setEditCalories(String(meal.calories || 0));
    setEditProtein(String(meal.protein || 0));
    setEditCarbs(String(meal.carbs || 0));
    setEditFat(String(meal.fat || 0));
    setEditMealType(meal.mealType || 'breakfast');
    setValidationError('');
  }

  // Save edited meal entry
  function handleSaveEditedMeal() {
    if (!editingMeal) return;

    const s = parseFloat(editServings) || 1;
    const validation = validateMealInput({
      foodName: editFoodName,
      servings: s,
      calories: editCalories,
      protein: editProtein,
      carbs: editCarbs,
      fat: editFat,
    });

    if (!validation.isValid) {
      setValidationError(Object.values(validation.errors)[0]);
      return;
    }

    dispatch({
      type: 'UPDATE_MEAL_ENTRY',
      payload: {
        id: editingMeal.id,
        foodName: editFoodName.trim(),
        servingSize: editServingSize.trim() || '1 serving',
        servings: s,
        mealType: editMealType,
        calories: Math.max(0, parseFloat(editCalories) || 0),
        protein: Math.max(0, parseFloat(editProtein) || 0),
        carbs: Math.max(0, parseFloat(editCarbs) || 0),
        fat: Math.max(0, parseFloat(editFat) || 0),
        updatedAt: new Date().toISOString(),
      },
    });

    setEditingMeal(null);
  }

  // Delete logged meal
  function handleDeleteMeal(id) {
    dispatch({ type: 'DELETE_MEAL_ENTRY', payload: id });
  }

  // Log water
  function handleLogWater(amount) {
    const amt = parseInt(amount, 10) || 250;
    dispatch({
      type: 'ADD_WATER_ENTRY',
      payload: {
        id: generateId(),
        date: today,
        amount: amt,
        unit: 'ml',
        createdAt: new Date().toISOString(),
      },
    });
    setWaterAmount('');
  }

  // Delete individual water entry
  function handleDeleteWater(id) {
    dispatch({ type: 'DELETE_WATER_ENTRY', payload: id });
  }

  // Save custom food
  function handleSaveCustomFood() {
    if (!customName.trim()) return;

    const food = {
      id: generateId(),
      name: customName.trim(),
      category: 'custom',
      servingSize: customServing || '100g',
      calories: Math.max(0, parseFloat(customCals) || 0),
      protein: Math.max(0, parseFloat(customProtein) || 0),
      carbs: Math.max(0, parseFloat(customCarbs) || 0),
      fat: Math.max(0, parseFloat(customFat) || 0),
      source: 'User Custom Food',
      isSample: false,
    };

    dispatch({ type: 'ADD_FOOD', payload: food });
    setCustomName('');
    setCustomCals('');
    setCustomProtein('');
    setCustomCarbs('');
    setCustomFat('');
    setCustomServing('100g');
    setShowAddFood(false);
  }

  const macroProgress = (label, currentVal, targetVal, colorHex, calPct) => {
    const pct = targetVal > 0 ? Math.min(100, (currentVal / targetVal) * 100) : 0;
    return (
      <div className="flex-1 min-w-[110px]">
        <div className="flex justify-between items-baseline text-xs mb-1.5">
          <span className="font-bold text-[var(--color-text-secondary)]">{label}</span>
          <span className="font-bold text-[var(--color-text-primary)]">
            {Math.round(currentVal)}
            <span className="text-[var(--color-text-tertiary)] font-medium text-[11px]">/{targetVal}g</span>
          </span>
        </div>
        <div className="h-2.5 bg-white/[0.08] rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: colorHex }}
          />
        </div>
        <div className="flex justify-between items-center text-[10px] text-[var(--color-text-tertiary)] font-semibold mt-1.5">
          <span>{pct.toFixed(0)}% goal</span>
          <span>{calPct}% energy</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Nutrition & Macros"
        subtitle={`${balance.consumed.toLocaleString()} kcal consumed today · ${balance.remaining >= 0 ? `${balance.remaining.toLocaleString()} kcal remaining` : `${balance.overAmount.toLocaleString()} kcal over target`}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowTargetModal(true)}>
              <Target size={14} /> Edit Targets
            </Button>
            <Button size="sm" onClick={() => { setMealType('breakfast'); setShowAddMeal(true); }}>
              <Plus size={16} /> Log Meal
            </Button>
          </div>
        }
      />

      <TabBar
        tabs={[
          { key: 'meals', label: "Today's Meals" },
          { key: 'foods', label: 'Food Library' },
          { key: 'water', label: 'Hydration' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'meals' && (
        <div className="space-y-5">
          {/* Calorie & Macro Target Card (Apple Fitness Inspired) */}
          <Card className="p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row items-center gap-6">
              {/* Calorie Ring Summary */}
              <div className="flex items-center gap-5 shrink-0">
                <ProgressRing
                  percent={balance.percent}
                  size={112}
                  strokeWidth={9}
                  color={balance.isOver ? 'var(--color-danger)' : 'var(--color-accent)'}
                >
                  <div className="text-center">
                    <p className="text-2xl font-black leading-none tracking-tight text-[var(--color-text-primary)]">
                      {balance.consumed.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1 font-bold uppercase tracking-wider">
                      /{targets.calories} kcal
                    </p>
                  </div>
                </ProgressRing>

                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--color-text-tertiary)] block mb-0.5">
                    {balance.isOver ? 'Exceeded Target' : 'Calories Remaining'}
                  </span>
                  <p className={`text-3xl font-black tracking-tight ${balance.isOver ? 'text-rose-400' : 'text-[var(--color-accent)]'}`}>
                    {balance.isOver ? `+${balance.overAmount.toLocaleString()}` : balance.remaining.toLocaleString()}
                    <span className="text-sm font-semibold text-[var(--color-text-secondary)] ml-1">kcal</span>
                  </p>
                  <p className="text-xs font-semibold text-[var(--color-text-tertiary)] mt-1">
                    {balance.percent}% of daily target achieved
                  </p>
                </div>
              </div>

              {/* 3 Macro Progress Bars */}
              <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-5 border-t lg:border-t-0 lg:border-l border-white/[0.08] pt-5 lg:pt-0 lg:pl-6">
                {macroProgress('Protein', totals.protein, targets.protein, 'var(--color-body)', macroDist.proteinPct)}
                {macroProgress('Carbs', totals.carbs, targets.carbs, 'var(--color-warning)', macroDist.carbsPct)}
                {macroProgress('Fat', totals.fat, targets.fat, 'var(--color-info)', macroDist.fatPct)}
              </div>
            </div>
          </Card>

          {/* Meals by Type */}
          <div className="space-y-4">
            {MEAL_TYPES.map(type => {
              const Icon = MEAL_ICONS[type];
              const meals = todayMeals.filter(m => m.mealType === type);
              const mealTotals = calculateDailyNutritionTotals(meals);

              return (
                <Card key={type} className="p-4 sm:p-5">
                  <div className="flex items-center justify-between mb-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[var(--color-accent)] shrink-0">
                        <Icon size={18} strokeWidth={2} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm sm:text-base text-[var(--color-text-primary)] capitalize">
                          {type}
                        </h3>
                        <p className="text-xs font-semibold text-[var(--color-text-tertiary)] mt-0.5">
                          {mealTotals.calories} kcal · P{mealTotals.protein}g · C{mealTotals.carbs}g · F{mealTotals.fat}g
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setMealType(type); setShowAddMeal(true); }}
                      className="text-xs font-bold text-[var(--color-accent)] hover:underline flex items-center gap-1 bg-[var(--color-accent-dim)] px-3 py-1.5 rounded-xl border border-[var(--color-accent)]/20 transition-all active:scale-95"
                    >
                      <Plus size={14} /> Add {type}
                    </button>
                  </div>

                  {meals.length === 0 ? (
                    <div className="py-5 text-center border border-dashed border-white/[0.08] rounded-2xl bg-white/[0.01]">
                      <p className="text-xs text-[var(--color-text-tertiary)]">
                        No {type} logged today
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {meals.map(m => {
                        const calculated = calculateMealItemTotals(m);
                        return (
                          <div
                            key={m.id}
                            className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-white/[0.025] border border-white/[0.06] hover:bg-white/[0.05] transition-all"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                                  {m.foodName}
                                </p>
                                {m.source && (
                                  <span className="text-[10px] font-semibold text-[var(--color-text-tertiary)] bg-white/[0.05] border border-white/[0.08] px-2 py-0.5 rounded-full shrink-0">
                                    {m.source.includes('Indian') ? '🇮🇳 Indian' : m.source.includes('Open Food') ? '📦 OFF' : 'Custom'}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                {m.servings > 1 ? `${m.servings} × ` : ''}{m.servingSize || '1 serving'}
                              </p>
                            </div>

                            <div className="text-right shrink-0">
                              <p className="text-sm font-black text-[var(--color-text-primary)]">
                                {calculated.calories} kcal
                              </p>
                              <p className="text-[11px] text-[var(--color-text-tertiary)] font-mono font-semibold">
                                P{calculated.protein} · C{calculated.carbs} · F{calculated.fat}
                              </p>
                            </div>

                            <div className="flex items-center gap-1 ml-2 shrink-0">
                              <button
                                onClick={() => handleOpenEditMeal(m)}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.08] transition-colors"
                                title="Edit meal entry"
                              >
                                <Edit3 size={15} />
                              </button>
                              <button
                                onClick={() => handleDeleteMeal(m.id)}
                                className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Delete meal entry"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'foods' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
              <input
                value={foodSearch}
                onChange={e => setFoodSearch(e.target.value)}
                placeholder="Search Cooked Indian Foods, packaged foods, or custom items..."
                className="!pl-10 !py-2.5"
              />
            </div>
            <Button size="sm" onClick={() => setShowAddFood(true)}>
              <Plus size={16} /> Create Custom Food
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-semibold">
            {[
              { id: 'all', label: 'All Items' },
              { id: 'indian', label: '🇮🇳 Cooked Indian Foods' },
              { id: 'packaged', label: '📦 Open Food Facts (Packaged)' },
              { id: 'custom', label: 'Custom Foods' },
            ].map(source => (
              <button
                key={source.id}
                onClick={() => setSearchSourceTab(source.id)}
                className={`px-3.5 py-2 rounded-xl whitespace-nowrap transition-all ${
                  searchSourceTab === source.id
                    ? 'bg-[var(--color-accent)] text-black font-black shadow-[0_2px_8px_rgba(132,204,22,0.3)]'
                    : 'bg-white/[0.04] border border-white/[0.06] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.08]'
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>

          {isSearchingRemote && (
            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/30 text-xs text-[var(--color-accent)] font-semibold animate-pulse">
              <RefreshCw size={15} className="animate-spin" /> Querying Open Food Facts API v3 database...
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {filteredFoodList.map(food => (
              <Card key={food.id} className="flex items-center justify-between gap-3.5 p-4 hover:border-white/[0.18] transition-all">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-sm text-[var(--color-text-primary)] truncate">{food.name}</p>
                    {food.isIndian && (
                      <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.2 rounded-full shrink-0">
                        ICMR-NIN
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    Serving: {food.servingSize || '100g'} · {food.calories} kcal
                  </p>
                  <p className="text-[11px] text-[var(--color-text-secondary)] font-mono font-medium mt-0.5">
                    P: {food.protein}g · C: {food.carbs}g · F: {food.fat}g
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    handleSelectFood(food);
                    setShowAddMeal(true);
                  }}
                >
                  <Plus size={14} /> Log
                </Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tab === 'water' && (
        <div className="max-w-xl mx-auto space-y-5">
          <Card className="flex flex-col items-center py-10 text-center">
            <div className="w-16 h-16 rounded-3xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-400 mb-4 shadow-[0_0_24px_rgba(56,189,248,0.25)]">
              <Droplets size={32} />
            </div>
            <p className="text-5xl font-black tracking-tight text-[var(--color-text-primary)]">{todayWater} ml</p>
            <p className="text-sm font-semibold text-[var(--color-text-secondary)] mt-1">of 2,500 ml daily hydration goal</p>
            
            <div className="w-full max-w-sm mt-6 h-3 bg-white/[0.08] rounded-full overflow-hidden shadow-[inset_0_1px_2px_rgba(0,0,0,0.5)]">
              <div
                className="h-full bg-gradient-to-r from-sky-400 to-blue-500 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(56,189,248,0.4)]"
                style={{ width: `${Math.min(100, (todayWater / 2500) * 100)}%` }}
              />
            </div>

            <div className="flex gap-2.5 mt-8">
              {[150, 250, 500].map(amt => (
                <Button key={amt} variant="secondary" size="sm" onClick={() => handleLogWater(amt)}>
                  +{amt} ml
                </Button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <label htmlFor="custom-water-input" className="font-bold text-sm text-[var(--color-text-primary)] mb-3 block">
              Custom Hydration Amount
            </label>
            <div className="flex gap-2.5">
              <input
                id="custom-water-input"
                type="number"
                value={waterAmount}
                onChange={e => setWaterAmount(e.target.value)}
                placeholder="Amount in ml"
                className="font-mono"
              />
              <Button onClick={() => handleLogWater(waterAmount)} size="sm">
                Add Water
              </Button>
            </div>
          </Card>

          {/* Today's Individual Water Logs */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.06]">
              <h3 className="font-bold text-sm text-[var(--color-text-primary)]">
                Today's Water Entries ({todayWaterEntries.length})
              </h3>
            </div>
            {todayWaterEntries.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center">
                No hydration entries logged for today yet. Use quick-add buttons above.
              </p>
            ) : (
              <div className="space-y-2">
                {todayWaterEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.025] border border-white/[0.05]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
                        <Droplets size={14} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-[var(--color-text-primary)]">
                          +{entry.amount} ml
                        </p>
                        <p className="text-[10px] text-[var(--color-text-tertiary)] font-mono">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Logged today'}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteWater(entry.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-1.5 h-auto"
                      aria-label={`Delete ${entry.amount} ml water entry`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* MODAL: Log Meal Entry */}
      <Modal
        isOpen={showAddMeal}
        onClose={() => { setShowAddMeal(false); setSelectedFood(null); }}
        title={selectedFood ? `Log ${selectedFood.name}` : `Add to ${mealType.toUpperCase()}`}
        maxWidth="max-w-xl"
      >
        {!selectedFood ? (
          <div>
            {/* Search tabs inside picker */}
            <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 text-xs font-semibold">
              {[
                { id: 'all', label: 'All' },
                { id: 'indian', label: '🇮🇳 Cooked Indian' },
                { id: 'packaged', label: '📦 Packaged (OFF v3)' },
                { id: 'barcode', label: '🔍 Barcode' },
                { id: 'custom', label: 'Custom' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setSearchSourceTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl whitespace-nowrap transition-colors ${
                    searchSourceTab === t.id
                      ? 'bg-[var(--color-accent)] text-black font-black'
                      : 'bg-white/[0.04] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {searchSourceTab === 'barcode' ? (
              <div className="space-y-4 py-2">
                <div>
                  <label className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                    Enter Barcode Number (EAN-13, UPC-A)
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={barcodeInput}
                      onChange={e => setBarcodeInput(e.target.value)}
                      placeholder="e.g., 8901030383793"
                      className="!font-mono"
                    />
                    <Button onClick={handleBarcodeLookup} disabled={barcodeLoading}>
                      {barcodeLoading ? <RefreshCw size={14} className="animate-spin" /> : <Barcode size={16} />}
                      Lookup
                    </Button>
                  </div>
                  {barcodeError && <p className="text-xs text-rose-400 font-semibold mt-2">{barcodeError}</p>}
                </div>
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs text-[var(--color-text-tertiary)] space-y-1">
                  <p className="font-bold text-[var(--color-text-secondary)]">Open Food Facts Integration</p>
                  <p>Looks up products directly from Open Food Facts database with verified nutritional values.</p>
                </div>
              </div>
            ) : (
              <div>
                <div className="relative mb-3">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                  <input
                    value={foodSearch}
                    onChange={e => setFoodSearch(e.target.value)}
                    placeholder={
                      searchSourceTab === 'indian'
                        ? 'Search Dal, Roti, Paneer, Biryani, Idli...'
                        : searchSourceTab === 'packaged'
                        ? 'Search packaged items via Open Food Facts...'
                        : 'Search all foods or Indian dishes...'
                    }
                    className="!pl-10"
                    autoFocus
                  />
                </div>

                {isSearchingRemote && (
                  <p className="text-xs text-[var(--color-accent)] animate-pulse mb-2 font-semibold">
                    Searching Open Food Facts v3 database...
                  </p>
                )}

                <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                  {filteredFoodList.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-[var(--color-text-tertiary)]">No foods found</p>
                      <button
                        onClick={() => { setShowAddMeal(false); setShowAddFood(true); }}
                        className="text-xs font-semibold text-[var(--color-accent)] mt-2 hover:underline"
                      >
                        + Create a custom food item
                      </button>
                    </div>
                  ) : (
                    filteredFoodList.map(f => (
                      <button
                        key={f.id}
                        onClick={() => handleSelectFood(f)}
                        className="w-full flex items-center justify-between p-3.5 rounded-2xl text-left bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                      >
                        <div className="flex-1 min-w-0 mr-3">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{f.name}</p>
                            {f.isIndian && (
                              <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 px-1.5 py-0.2 rounded">
                                Indian
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                            {f.servingSize} · {f.calories} kcal
                          </p>
                        </div>
                        <div className="text-right text-xs shrink-0 text-[var(--color-text-secondary)] font-mono font-semibold">
                          P{f.protein} C{f.carbs} F{f.fat}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Food Info & Attribution Banner */}
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="font-bold text-base text-[var(--color-text-primary)]">{selectedFood.name}</h4>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    Standard Serving: {selectedFood.servingSize || '1 serving'}
                  </p>
                </div>
                {selectedFood.source && (
                  <span className="text-[10px] font-bold text-[var(--color-text-tertiary)] bg-white/[0.06] px-2.5 py-0.5 rounded-full">
                    {selectedFood.source}
                  </span>
                )}
              </div>
            </div>

            {/* Warning if any nutritional values are missing */}
            {selectedFood.isPackaged && (!selectedFood.caloriesKnown || !selectedFood.proteinKnown || !selectedFood.carbsKnown || !selectedFood.fatKnown) && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400">
                <AlertCircle size={16} className="shrink-0" />
                <span>Some nutrition values were not specified on this product's packaging. Please review and fill in missing fields before logging.</span>
              </div>
            )}

            {/* Editable Servings & Macros */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="log-meal-servings" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Servings
                </label>
                <input
                  id="log-meal-servings"
                  type="number"
                  step="0.25"
                  min="0.1"
                  value={servings}
                  onChange={e => setServings(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>
              <div>
                <label htmlFor="log-meal-type" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Meal Slot
                </label>
                <select id="log-meal-type" value={mealType} onChange={e => setMealType(e.target.value)}>
                  {MEAL_TYPES.map(m => (
                    <option key={m} value={m} className="capitalize">{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06]">
              <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] mb-2.5 uppercase tracking-wider">
                Values Per Serving (Editable Overrides)
              </p>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label htmlFor="override-calories" className="text-[10px] text-[var(--color-text-tertiary)] block mb-0.5 font-bold">Calories</label>
                  <input
                    id="override-calories"
                    type="number"
                    value={overrideCalories}
                    onChange={e => setOverrideCalories(e.target.value)}
                    className="!py-1.5 !px-2 text-xs font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label htmlFor="override-protein" className="text-[10px] text-[var(--color-text-tertiary)] block mb-0.5 font-bold">Protein (g)</label>
                  <input
                    id="override-protein"
                    type="number"
                    step="0.1"
                    value={overrideProtein}
                    onChange={e => setOverrideProtein(e.target.value)}
                    className="!py-1.5 !px-2 text-xs font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label htmlFor="override-carbs" className="text-[10px] text-[var(--color-text-tertiary)] block mb-0.5 font-bold">Carbs (g)</label>
                  <input
                    id="override-carbs"
                    type="number"
                    step="0.1"
                    value={overrideCarbs}
                    onChange={e => setOverrideCarbs(e.target.value)}
                    className="!py-1.5 !px-2 text-xs font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label htmlFor="override-fat" className="text-[10px] text-[var(--color-text-tertiary)] block mb-0.5 font-bold">Fat (g)</label>
                  <input
                    id="override-fat"
                    type="number"
                    step="0.1"
                    value={overrideFat}
                    onChange={e => setOverrideFat(e.target.value)}
                    className="!py-1.5 !px-2 text-xs font-mono font-bold text-center"
                  />
                </div>
              </div>
            </div>

            {/* Calculated Log Preview */}
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 text-xs">
              <span className="font-bold text-[var(--color-accent)]">Total To Log:</span>
              <span className="font-extrabold text-[var(--color-text-primary)]">
                {Math.round((parseFloat(overrideCalories) || 0) * (parseFloat(servings) || 1))} kcal · P{((parseFloat(overrideProtein) || 0) * (parseFloat(servings) || 1)).toFixed(1)}g · C{((parseFloat(overrideCarbs) || 0) * (parseFloat(servings) || 1)).toFixed(1)}g · F{((parseFloat(overrideFat) || 0) * (parseFloat(servings) || 1)).toFixed(1)}g
              </span>
            </div>

            {validationError && (
              <p className="text-xs text-rose-400 font-semibold">{validationError}</p>
            )}

            <div className="flex gap-2.5 pt-2">
              <Button variant="secondary" onClick={() => setSelectedFood(null)}>
                Back
              </Button>
              <Button onClick={handleLogMeal} className="flex-1">
                Log Meal Entry
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Edit Logged Meal Entry */}
      <Modal
        isOpen={Boolean(editingMeal)}
        onClose={() => setEditingMeal(null)}
        title={`Edit ${editingMeal?.foodName || 'Meal Entry'}`}
      >
        {editingMeal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-meal-name" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Food Name
                </label>
                <input
                  id="edit-meal-name"
                  value={editFoodName}
                  onChange={e => setEditFoodName(e.target.value)}
                  placeholder="Food name"
                />
              </div>
              <div>
                <label htmlFor="edit-meal-serving-desc" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Serving Size Description
                </label>
                <input
                  id="edit-meal-serving-desc"
                  value={editServingSize}
                  onChange={e => setEditServingSize(e.target.value)}
                  placeholder="e.g., 1 katori (150g)"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-meal-servings" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Servings
                </label>
                <input
                  id="edit-meal-servings"
                  type="number"
                  step="0.25"
                  min="0.1"
                  value={editServings}
                  onChange={e => setEditServings(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>
              <div>
                <label htmlFor="edit-meal-type" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Meal Slot
                </label>
                <select id="edit-meal-type" value={editMealType} onChange={e => setEditMealType(e.target.value)}>
                  {MEAL_TYPES.map(m => (
                    <option key={m} value={m} className="capitalize">{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="edit-meal-calories" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Base Calories
                </label>
                <input
                  id="edit-meal-calories"
                  type="number"
                  value={editCalories}
                  onChange={e => setEditCalories(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>
              <div>
                <label htmlFor="edit-meal-protein" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Protein (g)
                </label>
                <input
                  id="edit-meal-protein"
                  type="number"
                  step="0.1"
                  value={editProtein}
                  onChange={e => setEditProtein(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>
              <div>
                <label htmlFor="edit-meal-carbs" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Carbs (g)
                </label>
                <input
                  id="edit-meal-carbs"
                  type="number"
                  step="0.1"
                  value={editCarbs}
                  onChange={e => setEditCarbs(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>
              <div>
                <label htmlFor="edit-meal-fat" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Fat (g)
                </label>
                <input
                  id="edit-meal-fat"
                  type="number"
                  step="0.1"
                  value={editFat}
                  onChange={e => setEditFat(e.target.value)}
                  className="font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-white/[0.04] border border-white/[0.08] text-xs">
              <span className="text-[var(--color-text-tertiary)] font-bold">Recalculated Total:</span>
              <span className="font-extrabold text-[var(--color-text-primary)]">
                {Math.round((parseFloat(editCalories) || 0) * (parseFloat(editServings) || 1))} kcal · P{((parseFloat(editProtein) || 0) * (parseFloat(editServings) || 1)).toFixed(1)}g · C{((parseFloat(editCarbs) || 0) * (parseFloat(editServings) || 1)).toFixed(1)}g · F{((parseFloat(editFat) || 0) * (parseFloat(editServings) || 1)).toFixed(1)}g
              </span>
            </div>

            {validationError && (
              <p className="text-xs text-rose-400 font-semibold">{validationError}</p>
            )}

            <div className="flex gap-2.5 pt-2">
              <Button variant="secondary" onClick={() => setEditingMeal(null)}>
                Cancel
              </Button>
              <Button onClick={handleSaveEditedMeal} className="flex-1">
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Edit Daily Calorie & Macro Targets */}
      <Modal
        isOpen={showTargetModal}
        onClose={() => setShowTargetModal(false)}
        title="Edit Daily Nutrition Targets"
      >
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
            Customize your daily caloric intake and macronutrient goals for today. Historical meal logs remain untouched.
          </p>

          <div>
            <label htmlFor="target-calories-input" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
              Daily Target Calories (kcal)
            </label>
            <input
              id="target-calories-input"
              type="number"
              value={targetCals}
              onChange={e => setTargetCals(e.target.value)}
              placeholder="2200"
              className="font-mono font-bold text-base"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor="target-protein-input" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                Protein (g)
              </label>
              <input
                id="target-protein-input"
                type="number"
                value={targetProtein}
                onChange={e => setTargetProtein(e.target.value)}
                placeholder="150"
                className="font-mono font-bold"
              />
            </div>
            <div>
              <label htmlFor="target-carbs-input" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                Carbs (g)
              </label>
              <input
                id="target-carbs-input"
                type="number"
                value={targetCarbs}
                onChange={e => setTargetCarbs(e.target.value)}
                placeholder="250"
                className="font-mono font-bold"
              />
            </div>
            <div>
              <label htmlFor="target-fat-input" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                Fat (g)
              </label>
              <input
                id="target-fat-input"
                type="number"
                value={targetFat}
                onChange={e => setTargetFat(e.target.value)}
                placeholder="70"
                className="font-mono font-bold"
              />
            </div>
          </div>

          {/* Caloric distribution preview */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs text-[var(--color-text-secondary)]">
            <div className="flex justify-between font-bold text-[var(--color-text-primary)] mb-1">
              <span>Energy from Planned Macros:</span>
              <span className="text-[var(--color-accent)] font-mono">
                {(parseFloat(targetProtein) || 0) * 4 + (parseFloat(targetCarbs) || 0) * 4 + (parseFloat(targetFat) || 0) * 9} kcal
              </span>
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              4 kcal per g protein & carbs · 9 kcal per g fat
            </p>
          </div>

          <Button onClick={handleSaveTargets} className="w-full">
            Save Targets for Today
          </Button>
        </div>
      </Modal>

      {/* MODAL: Create Custom Food */}
      <Modal
        isOpen={showAddFood}
        onClose={() => setShowAddFood(false)}
        title="Create Custom Food Item"
      >
        <div className="space-y-3.5">
          <div>
            <label htmlFor="custom-food-name" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">Food Name</label>
            <input
              id="custom-food-name"
              value={customName}
              onChange={e => setCustomName(e.target.value)}
              placeholder="e.g., Mom's Special Dal Tadka"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="custom-food-serving" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">Serving Size</label>
            <input
              id="custom-food-serving"
              value={customServing}
              onChange={e => setCustomServing(e.target.value)}
              placeholder="e.g., 1 katori (150g)"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="custom-food-cals" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">Calories (kcal)</label>
              <input
                id="custom-food-cals"
                type="number"
                value={customCals}
                onChange={e => setCustomCals(e.target.value)}
                placeholder="150"
                className="font-mono font-bold"
              />
            </div>
            <div>
              <label htmlFor="custom-food-protein" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">Protein (g)</label>
              <input
                id="custom-food-protein"
                type="number"
                step="0.1"
                value={customProtein}
                onChange={e => setCustomProtein(e.target.value)}
                placeholder="7"
                className="font-mono font-bold"
              />
            </div>
            <div>
              <label htmlFor="custom-food-carbs" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">Carbs (g)</label>
              <input
                id="custom-food-carbs"
                type="number"
                step="0.1"
                value={customCarbs}
                onChange={e => setCustomCarbs(e.target.value)}
                placeholder="20"
                className="font-mono font-bold"
              />
            </div>
            <div>
              <label htmlFor="custom-food-fat" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">Fat (g)</label>
              <input
                id="custom-food-fat"
                type="number"
                step="0.1"
                value={customFat}
                onChange={e => setCustomFat(e.target.value)}
                placeholder="4"
                className="font-mono font-bold"
              />
            </div>
          </div>
          <Button onClick={handleSaveCustomFood} disabled={!customName.trim()} className="w-full">
            Save Custom Food
          </Button>
        </div>
      </Modal>
    </div>
  );
}

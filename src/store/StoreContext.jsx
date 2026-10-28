import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import { loadData, saveData, generateId, todayStr } from '../utils/storage';
import { defaultExercises, defaultFoods } from '../data/defaults';

const StoreContext = createContext(null);

function initState() {
  const data = loadData();
  // Seed exercises and foods if empty
  if (!data.exercises || data.exercises.length === 0) {
    data.exercises = [...defaultExercises];
  }
  if (!data.foods || data.foods.length === 0) {
    data.foods = [...defaultFoods];
  }
  return data;
}

function reducer(state, action) {
  switch (action.type) {
    // --- Profile & Preferences ---
    case 'SET_PROFILE':
      return { ...state, profile: { ...state.profile, ...action.payload } };
    case 'SET_PREFERENCES':
      return { ...state, preferences: { ...state.preferences, ...action.payload } };

    // --- Challenges ---
    case 'ADD_CHALLENGE':
      return { ...state, challenges: [...state.challenges, action.payload] };
    case 'UPDATE_CHALLENGE':
      return { ...state, challenges: state.challenges.map(c => c.id === action.payload.id ? { ...c, ...action.payload } : c) };

    // --- Habits ---
    case 'ADD_HABIT':
      return { ...state, habits: [...state.habits, action.payload] };
    case 'UPDATE_HABIT':
      return { ...state, habits: state.habits.map(h => h.id === action.payload.id ? { ...h, ...action.payload } : h) };
    case 'DELETE_HABIT':
      return { ...state, habits: state.habits.filter(h => h.id !== action.payload) };

    // --- Habit Completions ---
    case 'TOGGLE_HABIT_COMPLETION': {
      const { habitId, date } = action.payload;
      const exists = state.habitCompletions.find(c => c.habitId === habitId && c.date === date);
      if (exists) {
        return { ...state, habitCompletions: state.habitCompletions.filter(c => !(c.habitId === habitId && c.date === date)) };
      }
      return { ...state, habitCompletions: [...state.habitCompletions, { id: generateId(), habitId, date, completedAt: new Date().toISOString() }] };
    }

    // --- Workout Sessions ---
    case 'ADD_WORKOUT_SESSION':
      return { ...state, workoutSessions: [...state.workoutSessions, action.payload] };
    case 'UPDATE_WORKOUT_SESSION':
      return { ...state, workoutSessions: state.workoutSessions.map(w => w.id === action.payload.id ? { ...w, ...action.payload } : w) };
    case 'DELETE_WORKOUT_SESSION':
      return { ...state, workoutSessions: state.workoutSessions.filter(w => w.id !== action.payload) };

    // --- Workout Templates ---
    case 'ADD_WORKOUT_TEMPLATE':
      return { ...state, workoutTemplates: [...state.workoutTemplates, action.payload] };
    case 'UPDATE_WORKOUT_TEMPLATE':
      return { ...state, workoutTemplates: state.workoutTemplates.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t) };
    case 'DELETE_WORKOUT_TEMPLATE':
      return { ...state, workoutTemplates: state.workoutTemplates.filter(t => t.id !== action.payload) };

    // --- Exercises ---
    case 'ADD_EXERCISE':
      return { ...state, exercises: [...state.exercises, action.payload] };

    // --- Body Measurements ---
    case 'ADD_BODY_MEASUREMENT':
      return { ...state, bodyMeasurements: [...state.bodyMeasurements, action.payload] };

    // --- Foods ---
    case 'ADD_FOOD':
      return { ...state, foods: [...state.foods, action.payload] };

    // --- Meal Entries ---
    case 'ADD_MEAL_ENTRY':
      return { ...state, mealEntries: [...state.mealEntries, action.payload] };
    case 'UPDATE_MEAL_ENTRY':
      return {
        ...state,
        mealEntries: state.mealEntries.map(m => m.id === action.payload.id ? { ...m, ...action.payload } : m),
      };
    case 'DELETE_MEAL_ENTRY':
      return { ...state, mealEntries: state.mealEntries.filter(m => m.id !== action.payload) };

    // --- Nutrition Targets & History ---
    case 'SET_NUTRITION_TARGETS': {
      const { targets, date } = action.payload;
      const history = { ...(state.nutritionTargetHistory || {}) };
      if (date) {
        history[date] = { ...targets };
      }
      return {
        ...state,
        preferences: {
          ...state.preferences,
          nutritionTargets: { ...targets },
        },
        nutritionTargetHistory: history,
      };
    }

    // --- Water ---
    case 'ADD_WATER_ENTRY':
      return { ...state, waterEntries: [...state.waterEntries, action.payload] };
    case 'DELETE_WATER_ENTRY':
      return { ...state, waterEntries: state.waterEntries.filter(w => w.id !== action.payload) };

    // --- Mood ---
    case 'ADD_MOOD_LOG':
      return { ...state, moodLogs: [...state.moodLogs, action.payload] };

    // --- Sleep ---
    case 'ADD_SLEEP_LOG':
      return { ...state, sleepLogs: [...state.sleepLogs, action.payload] };

    // --- Meditation ---
    case 'ADD_MEDITATION':
      return { ...state, meditations: [...state.meditations, action.payload] };

    // --- Journal ---
    case 'ADD_JOURNAL_ENTRY':
      return { ...state, journalEntries: [...state.journalEntries, action.payload] };
    case 'UPDATE_JOURNAL_ENTRY':
      return { ...state, journalEntries: state.journalEntries.map(j => j.id === action.payload.id ? { ...j, ...action.payload } : j) };

    // --- Learning Goals ---
    case 'ADD_LEARNING_GOAL':
      return { ...state, learningGoals: [...state.learningGoals, action.payload] };
    case 'UPDATE_LEARNING_GOAL':
      return { ...state, learningGoals: state.learningGoals.map(g => g.id === action.payload.id ? { ...g, ...action.payload } : g) };
    case 'DELETE_LEARNING_GOAL':
      return { ...state, learningGoals: state.learningGoals.filter(g => g.id !== action.payload) };

    // --- Learning Sessions ---
    case 'ADD_LEARNING_SESSION':
      return { ...state, learningSessions: [...state.learningSessions, action.payload] };

    // --- Transactions ---
    case 'ADD_TRANSACTION':
      return { ...state, transactions: [...state.transactions, action.payload] };
    case 'UPDATE_TRANSACTION':
      return { ...state, transactions: state.transactions.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t) };
    case 'DELETE_TRANSACTION':
      return { ...state, transactions: state.transactions.filter(t => t.id !== action.payload) };

    // --- Budgets ---
    case 'SET_BUDGET':
      return { ...state, budgets: [...state.budgets.filter(b => b.month !== action.payload.month), action.payload] };

    // --- Savings Goals ---
    case 'ADD_SAVINGS_GOAL':
      return { ...state, savingsGoals: [...state.savingsGoals, action.payload] };
    case 'UPDATE_SAVINGS_GOAL':
      return { ...state, savingsGoals: state.savingsGoals.map(g => g.id === action.payload.id ? { ...g, ...action.payload } : g) };

    // --- Weekly Reviews ---
    case 'ADD_WEEKLY_REVIEW':
      return { ...state, weeklyReviews: [...state.weeklyReviews, action.payload] };

    // --- Bulk ---
    case 'IMPORT_DATA':
      return { ...action.payload };

    default:
      return state;
  }
}

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, initState);

  // Persist on every state change
  useEffect(() => {
    saveData(state);
  }, [state]);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.preferences.theme);
  }, [state.preferences.theme]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

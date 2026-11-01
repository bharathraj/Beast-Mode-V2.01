// Centralized localStorage utility with safe JSON and schema versioning
const STORAGE_KEY = 'bm90_data';
const SCHEMA_VERSION = 1;

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function todayStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateStr(d) {
  const dateObj = typeof d === 'string' ? new Date(d.length === 10 ? d + 'T00:00:00' : d) : new Date(d);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function daysBetween(a, b) {
  const msA = new Date(a + 'T00:00:00').getTime();
  const msB = new Date(b + 'T00:00:00').getTime();
  return Math.floor((msB - msA) / 86400000);
}

function getDefaultData() {
  return {
    _schemaVersion: SCHEMA_VERSION,
    profile: { name: '', avatar: '', height: '', heightUnit: 'cm' },
    preferences: {
      theme: 'dark',
      units: 'metric',
      weekStart: 'monday',
      onboardingComplete: false,
      shareProgress: false,
      nutritionTargets: { calories: 2200, protein: 150, carbs: 250, fat: 70 },
    },
    nutritionTargetHistory: {},
    challenges: [],
    habits: [],
    habitCompletions: [],
    workoutTemplates: [],
    workoutSessions: [],
    exercises: [],
    bodyMeasurements: [],
    foods: [],
    mealEntries: [],
    waterEntries: [],
    moodLogs: [],
    sleepLogs: [],
    meditations: [],
    journalEntries: [],
    learningGoals: [],
    learningSessions: [],
    transactions: [],
    budgets: [],
    savingsGoals: [],
    weeklyReviews: [],
  };
}

function safeParse(json) {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function migrate(data) {
  if (!data || typeof data !== 'object') return getDefaultData();
  const version = data._schemaVersion || 0;
  // Future migrations go here
  if (version < SCHEMA_VERSION) {
    data._schemaVersion = SCHEMA_VERSION;
  }
  // Ensure all keys exist
  const defaults = getDefaultData();
  for (const key of Object.keys(defaults)) {
    if (!(key in data)) {
      data[key] = defaults[key];
    }
  }
  return data;
}

export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultData();
    const parsed = safeParse(raw);
    return migrate(parsed);
  } catch {
    return getDefaultData();
  }
}

export function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Failed to save data:', e);
    return false;
  }
}

export function exportData() {
  return JSON.stringify(loadData(), null, 2);
}

export function importData(jsonStr) {
  const parsed = safeParse(jsonStr);
  if (!parsed || typeof parsed !== 'object') {
    return { success: false, error: 'Invalid JSON format' };
  }
  if (!parsed._schemaVersion) {
    return { success: false, error: 'Missing schema version — not a Beastmode 90 export' };
  }
  const migrated = migrate(parsed);
  saveData(migrated);
  return { success: true };
}

export function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
}

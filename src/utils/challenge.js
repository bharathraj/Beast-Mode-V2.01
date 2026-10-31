import { todayStr, daysBetween, generateId, dateStr } from './storage.js';

export const CHALLENGE_MODES = {
  wanderer: {
    key: 'wanderer',
    name: 'Wanderer',
    tagline: 'Your journey, your pace',
    description: 'Flexible self-improvement without deadlines. Track habits freely, build routines gradually.',
    duration: null,
    icon: '🌊',
    color: '#3b82f6',
  },
  monk: {
    key: 'monk',
    name: 'Monk Mode',
    tagline: '30 days of discipline',
    description: 'A structured 30-day challenge. Build consistent habits and prove your discipline.',
    duration: 30,
    icon: '🧘',
    color: '#a855f7',
  },
  beast: {
    key: 'beast',
    name: 'Beast Mode',
    tagline: '90 days of transformation',
    description: 'The ultimate 90-day challenge in three phases. Transform your body, mind, and life.',
    duration: 90,
    icon: '🔥',
    color: '#84cc16',
  },
};

export function createChallenge(mode, selectedHabits = [], startDate = null) {
  const config = CHALLENGE_MODES[mode];
  const start = startDate || todayStr();
  let endDate = null;
  if (config.duration) {
    const end = new Date(start + 'T00:00:00');
    end.setDate(end.getDate() + config.duration - 1);
    endDate = dateStr(end);
  }

  return {
    id: generateId(),
    mode,
    name: config.name,
    startDate: start,
    endDate,
    duration: config.duration,
    status: 'active', // active | completed | abandoned
    selectedHabitIds: selectedHabits,
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function getChallengeDay(challenge) {
  if (!challenge || challenge.status !== 'active') return 0;
  const today = todayStr();
  return Math.max(1, daysBetween(challenge.startDate, today) + 1);
}

export function getChallengeProgress(challenge) {
  if (!challenge) return { day: 0, total: 0, percent: 0, remaining: 0 };
  const day = getChallengeDay(challenge);
  const total = challenge.duration || day;
  const percent = challenge.duration ? Math.min(100, Math.round((day / total) * 100)) : 0;
  const remaining = challenge.duration ? Math.max(0, total - day) : 0;
  return { day, total, remaining, percent };
}

export function getPhase(challenge) {
  if (!challenge || challenge.mode !== 'beast') return null;
  const day = getChallengeDay(challenge);
  if (day <= 30) return { number: 1, name: 'Foundation', range: '1–30', daysIn: day, daysTotal: 30 };
  if (day <= 60) return { number: 2, name: 'Momentum', range: '31–60', daysIn: day - 30, daysTotal: 30 };
  return { number: 3, name: 'Transformation', range: '61–90', daysIn: day - 60, daysTotal: 30 };
}

export function isChallengeExpired(challenge) {
  if (!challenge || !challenge.endDate) return false;
  return todayStr() > challenge.endDate;
}

export function getDailyCompletionRate(habits, completions, date) {
  const today = date || todayStr();
  const activeHabits = habits.filter(h => !h.archived && isHabitScheduledForDate(h, today));
  if (activeHabits.length === 0) return { completed: 0, total: 0, percent: 0 };
  const completed = activeHabits.filter(h => completions.some(c => c.habitId === h.id && c.date === today)).length;
  return { completed, total: activeHabits.length, percent: Math.round((completed / activeHabits.length) * 100) };
}

export function isHabitScheduledForDate(habit, date) {
  if (!habit.schedule || habit.schedule === 'daily') return true;
  if (Array.isArray(habit.schedule)) {
    const targetDate = typeof date === 'string' ? date.slice(0, 10) : todayStr();
    const d = new Date(targetDate + 'T00:00:00');
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return habit.schedule.includes(dayNames[d.getDay()]);
  }
  return true;
}

export function getStreak(habitId, completions, referenceDate = null) {
  if (!Array.isArray(completions) || completions.length === 0) {
    return { current: 0, longest: 0 };
  }

  // Collect and deduplicate valid completion dates for this habit
  const datesSet = new Set();
  for (const c of completions) {
    if (c && c.habitId === habitId && c.date) {
      const dStr = typeof c.date === 'string' ? c.date.slice(0, 10) : dateStr(c.date);
      datesSet.add(dStr);
    }
  }

  if (datesSet.size === 0) {
    return { current: 0, longest: 0 };
  }

  const today = referenceDate || todayStr();
  const dYesterday = new Date(today + 'T00:00:00');
  dYesterday.setDate(dYesterday.getDate() - 1);
  const yesterday = dateStr(dYesterday);

  // Current streak calculation:
  // - If completed today, walk backwards starting from today
  // - If not completed today but completed yesterday, the streak is maintained throughout today; walk backwards from yesterday
  // - If neither today nor yesterday was completed, a full day was missed and the streak is broken (0)
  let current = 0;
  const startCheck = datesSet.has(today) ? today : (datesSet.has(yesterday) ? yesterday : null);

  if (startCheck) {
    let curr = new Date(startCheck + 'T00:00:00');
    while (datesSet.has(dateStr(curr))) {
      current++;
      curr.setDate(curr.getDate() - 1);
    }
  }

  // Longest streak calculation across all unique completion dates
  const sortedAsc = Array.from(datesSet).sort();
  let longest = 1;
  let run = 1;

  for (let i = 1; i < sortedAsc.length; i++) {
    if (daysBetween(sortedAsc[i - 1], sortedAsc[i]) === 1) {
      run++;
    } else if (daysBetween(sortedAsc[i - 1], sortedAsc[i]) > 1) {
      run = 1;
    }
    if (run > longest) {
      longest = run;
    }
  }

  longest = Math.max(longest, current);

  return { current, longest };
}

export function getWeekDates(weekOffset = 0) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + weekOffset * 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(dateStr(d));
  }
  return dates;
}

/**
 * Shared calculation utility for category habit completion on a specific date.
 * Category completion % = (completed scheduled habits in category / total scheduled habits in category) * 100.
 * If total scheduled habits is 0, percent is null and hasHabits is false (empty/neutral state).
 */
export function getCategoryCompletionRate(category, habits = [], completions = [], date = todayStr()) {
  const targetDate = typeof date === 'string' ? date.slice(0, 10) : todayStr();
  const scheduledHabits = (habits || []).filter(
    h => !h.archived && h.category === category && isHabitScheduledForDate(h, targetDate)
  );

  const total = scheduledHabits.length;
  if (total === 0) {
    return {
      completed: 0,
      total: 0,
      percent: null,
      hasHabits: false,
    };
  }

  const completed = scheduledHabits.filter(h =>
    (completions || []).some(c => c.habitId === h.id && c.date === targetDate)
  ).length;

  const percent = Math.round((completed / total) * 100);

  return {
    completed,
    total,
    percent,
    hasHabits: true,
  };
}

export function getCategoryScore(category, habits, completions, dateOrDays = null) {
  if (typeof dateOrDays === 'number') {
    const days = dateOrDays;
    const catHabits = (habits || []).filter(h => h.category === category && !h.archived);
    if (catHabits.length === 0) return 0;
    let total = 0;
    let completed = 0;
    const today = new Date();
    for (let i = 0; i < days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateString = dateStr(d);
      for (const h of catHabits) {
        if (isHabitScheduledForDate(h, dateString)) {
          total++;
          if ((completions || []).some(c => c.habitId === h.id && c.date === dateString)) {
            completed++;
          }
        }
      }
    }
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  }

  const rate = getCategoryCompletionRate(category, habits, completions, dateOrDays);
  return rate.percent ?? 0;
}

export function getMissedDays(challenge, habits, completions) {
  if (!challenge) return [];
  const missed = [];
  const today = todayStr();
  const start = challenge.startDate;
  const end = challenge.endDate || today;
  const d = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const todayDate = new Date(today + 'T00:00:00');

  while (d <= endDate && d < todayDate) {
    const dateStrVal = dateStr(d);
    const scheduled = habits.filter(h =>
      !h.archived && challenge.selectedHabitIds.includes(h.id) && isHabitScheduledForDate(h, dateStrVal)
    );
    if (scheduled.length > 0) {
      const completed = scheduled.filter(h => completions.some(c => c.habitId === h.id && c.date === dateStrVal));
      if (completed.length === 0) {
        missed.push(dateStrVal);
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return missed;
}

export function getMilestones(challenge) {
  if (!challenge || !challenge.duration) return [];
  const currentDay = getChallengeDay(challenge);
  const milestones = [];
  
  if (challenge.mode === 'monk') {
    milestones.push({ day: 10, title: 'Discipline Ignite', description: 'First 10 days of consistent execution', achieved: currentDay >= 10 });
    milestones.push({ day: 20, title: 'Habit Habituation', description: '20 days of focused routine', achieved: currentDay >= 20 });
    milestones.push({ day: 30, title: 'Monk Master', description: '30 days of unyielding discipline', achieved: currentDay >= 30 });
  } else if (challenge.mode === 'beast') {
    milestones.push({ day: 30, title: 'Phase 1: Foundation', description: 'Built core habits and routine baseline', achieved: currentDay >= 30 });
    milestones.push({ day: 60, title: 'Phase 2: Momentum', description: 'Solidified peak physical & mental strength', achieved: currentDay >= 60 });
    milestones.push({ day: 90, title: 'Phase 3: Transformation', description: 'Full Beastmode 90 transformation achieved', achieved: currentDay >= 90 });
  }
  return milestones;
}

export function getMonthlyCompletionRate(habits, completions, monthStr) {
  const m = monthStr || todayStr().slice(0, 7);
  const activeHabits = habits.filter(h => !h.archived);
  if (activeHabits.length === 0) return { percent: 0, total: 0, completed: 0 };
  
  const [year, month] = m.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let totalScheduled = 0;
  let totalCompleted = 0;
  const today = todayStr();
  
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStr > today) break;
    
    for (const h of activeHabits) {
      if (isHabitScheduledForDate(h, dateStr)) {
        totalScheduled++;
        if (completions.some(c => c.habitId === h.id && c.date === dateStr)) {
          totalCompleted++;
        }
      }
    }
  }
  
  return {
    percent: totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0,
    total: totalScheduled,
    completed: totalCompleted,
    month: m,
  };
}

export function generateTransformationReport(challenge, state) {
  if (!challenge) return null;
  const start = challenge.startDate;
  const end = challenge.endDate && challenge.endDate < todayStr() ? challenge.endDate : todayStr();
  
  // Habits inside challenge range
  const relevantCompletions = (state.habitCompletions || []).filter(c => c.date >= start && c.date <= end);
  let totalScheduled = 0;
  let totalCompleted = 0;
  const sDate = new Date(start + 'T00:00:00');
  const eDate = new Date(end + 'T00:00:00');
  const cur = new Date(sDate);
  const activeHabits = (state.habits || []).filter(h => !h.archived && (challenge.selectedHabitIds?.length ? challenge.selectedHabitIds.includes(h.id) : true));
  
  while (cur <= eDate) {
    const dStr = dateStr(cur);
    for (const h of activeHabits) {
      if (isHabitScheduledForDate(h, dStr)) {
        totalScheduled++;
        if (relevantCompletions.some(c => c.habitId === h.id && c.date === dStr)) {
          totalCompleted++;
        }
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  
  const habitRate = totalScheduled > 0 ? Math.round((totalCompleted / totalScheduled) * 100) : 0;
  
  // Workouts in range
  const sessions = (state.workoutSessions || []).filter(w => w.date >= start && w.date <= end);
  let totalVolume = 0;
  let totalSets = 0;
  sessions.forEach(s => {
    (s.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(set => {
        if (set.completed) {
          totalSets++;
          if (set.weight && set.reps) {
            totalVolume += parseFloat(set.weight) * parseInt(set.reps);
          }
        }
      });
    });
  });
  
  // Nutrition & water
  const meals = (state.mealEntries || []).filter(m => m.date >= start && m.date <= end);
  const waterEntries = (state.waterEntries || []).filter(w => w.date >= start && w.date <= end);
  const totalWater = waterEntries.reduce((sum, w) => sum + w.amount, 0);
  
  // Learning
  const learningSessions = (state.learningSessions || []).filter(l => l.date >= start && l.date <= end);
  const totalLearningMinutes = learningSessions.reduce((sum, l) => sum + (l.duration || 0), 0);
  
  // Mood and sleep
  const moods = (state.moodLogs || []).filter(m => m.date >= start && m.date <= end);
  const avgMood = moods.length > 0 ? (moods.reduce((s, m) => s + m.value, 0) / moods.length).toFixed(1) : null;
  const sleeps = (state.sleepLogs || []).filter(s => s.date >= start && s.date <= end);
  const avgSleep = sleeps.length > 0 ? (sleeps.reduce((s, sl) => s + sl.hours, 0) / sleeps.length).toFixed(1) : null;
  
  // Body weight delta
  const measurements = [...(state.bodyMeasurements || [])]
    .filter(m => m.date >= start && m.date <= end && m.weight)
    .sort((a, b) => a.date.localeCompare(b.date));
  const startWeight = measurements.length > 0 ? measurements[0].weight : null;
  const endWeight = measurements.length > 1 ? measurements[measurements.length - 1].weight : startWeight;
  const weightChange = (startWeight !== null && endWeight !== null) ? Number((endWeight - startWeight).toFixed(1)) : null;

  // Finance in range
  const transactions = (state.transactions || []).filter(t => t.date >= start && t.date <= end);
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  
  return {
    challengeName: challenge.name,
    mode: challenge.mode,
    startDate: start,
    endDate: end,
    daysTracked: daysBetween(start, end) + 1,
    habitRate,
    totalHabitsCompleted: totalCompleted,
    workoutCount: sessions.length,
    totalVolume,
    totalSets,
    totalMeals: meals.length,
    totalWater,
    learningHours: Number((totalLearningMinutes / 60).toFixed(1)),
    avgMood,
    avgSleep,
    startWeight,
    endWeight,
    weightChange,
    netSavings: totalIncome - totalExpenses,
    milestones: getMilestones(challenge),
  };
}

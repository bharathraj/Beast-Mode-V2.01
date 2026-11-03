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
  if (!config) {
    throw new Error(`Invalid challenge mode: ${mode}`);
  }

  const today = todayStr();
  if (startDate && startDate > today) {
    throw new Error(`Challenge start date cannot be in the future (${startDate}).`);
  }

  const start = startDate || today;
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
    selectedHabitIds: Array.isArray(selectedHabits) ? [...selectedHabits] : [],
    completedAt: null,
    createdAt: new Date().toISOString(),
  };
}

export function getChallengeDay(challenge) {
  if (!challenge) return 0;
  const today = todayStr();
  const start = challenge.startDate || today;

  // If challenge is completed or abandoned, freeze day at completion or end date
  if (challenge.status === 'completed' || challenge.status === 'abandoned') {
    const effectiveEnd = challenge.completedAt
      ? dateStr(challenge.completedAt)
      : (challenge.endDate && challenge.endDate < today ? challenge.endDate : today);
    const day = Math.max(1, daysBetween(start, effectiveEnd) + 1);
    return challenge.duration ? Math.min(challenge.duration, day) : day;
  }

  if (challenge.status !== 'active') return 0;

  const elapsed = Math.max(1, daysBetween(start, today) + 1);
  // Expired challenges never advance beyond their duration
  return challenge.duration ? Math.min(challenge.duration, elapsed) : elapsed;
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
  if (day <= 30) return { number: 1, name: 'Foundation', range: '1–30', daysIn: Math.min(30, Math.max(1, day)), daysTotal: 30 };
  if (day <= 60) return { number: 2, name: 'Momentum', range: '31–60', daysIn: Math.min(30, Math.max(1, day - 30)), daysTotal: 30 };
  return { number: 3, name: 'Transformation', range: '61–90', daysIn: Math.min(30, Math.max(1, day - 60)), daysTotal: 30 };
}

export function isChallengeExpired(challenge) {
  if (!challenge || !challenge.endDate) return false;
  return todayStr() > challenge.endDate;
}

export function getDailyCompletionRate(habits, completions, date) {
  const today = date || todayStr();
  const activeHabits = (habits || []).filter(h => !h.archived && isHabitScheduledForDate(h, today));
  if (activeHabits.length === 0) return { completed: 0, total: 0, percent: 0 };
  const completed = activeHabits.filter(h => (completions || []).some(c => c.habitId === h.id && c.date === today)).length;
  return { completed, total: activeHabits.length, percent: Math.round((completed / activeHabits.length) * 100) };
}

export function isHabitScheduledForDate(habit, date) {
  if (!habit) return false;
  if (habit.schedule === null || habit.schedule === undefined) return true;
  if (habit.schedule === 'daily' || habit.schedule === '"daily"') return true;
  if (Array.isArray(habit.schedule)) {
    if (habit.schedule.length === 0) return false;
    const targetDate = typeof date === 'string' ? date.slice(0, 10) : todayStr();
    const d = new Date(targetDate + 'T00:00:00');
    // Deterministic ISO mapping: 1=Mon .. 7=Sun (d.getDay(): 0=Sun)
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const abbrNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
    const currentDayName = dayNames[d.getDay()];
    const currentAbbr = abbrNames[d.getDay()];
    return habit.schedule.some(s => {
      if (typeof s !== 'string') return false;
      const str = s.toLowerCase().replace(/^"|"$/g, '').trim();
      return str === currentDayName || str === currentAbbr || str === 'daily';
    });
  }
  if (typeof habit.schedule === 'string') {
    const trimmed = habit.schedule.trim().toLowerCase();
    if (trimmed === 'daily') return true;
    try {
      const parsed = JSON.parse(habit.schedule);
      if (Array.isArray(parsed)) {
        return isHabitScheduledForDate({ ...habit, schedule: parsed }, date);
      }
      if (typeof parsed === 'string' && parsed.toLowerCase().trim() === 'daily') {
        return true;
      }
    } catch {
      // not JSON
    }
    return false;
  }
  // Fail-closed for all other unsupported types (number, object, boolean)
  return false;
}

export function getStreak(habitId, completions, referenceDate = null) {
  if (!Array.isArray(completions) || completions.length === 0) {
    return { current: 0, longest: 0 };
  }

  const today = referenceDate || todayStr();

  // Collect and deduplicate valid completion dates for this habit
  // Strictly exclude future-dated completions (> today)
  const datesSet = new Set();
  for (const c of completions) {
    if (c && c.habitId === habitId && c.date) {
      const dStr = typeof c.date === 'string' ? c.date.slice(0, 10) : dateStr(c.date);
      if (dStr <= today) {
        datesSet.add(dStr);
      }
    }
  }

  if (datesSet.size === 0) {
    return { current: 0, longest: 0 };
  }

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

  // Longest streak calculation across all unique completion dates <= today
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

export function getMissedDays(challenge, habits = [], completions = []) {
  if (!challenge) return [];
  const missed = [];
  const today = todayStr();
  const start = challenge.startDate;
  const end = challenge.endDate && challenge.endDate < today ? challenge.endDate : today;
  const d = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  const todayDate = new Date(today + 'T00:00:00');

  const selectedIds = Array.isArray(challenge.selectedHabitIds) && challenge.selectedHabitIds.length > 0
    ? new Set(challenge.selectedHabitIds)
    : null;

  const activeHabits = (habits || []).filter(h =>
    !h.archived && (selectedIds ? selectedIds.has(h.id) : true)
  );

  while (d <= endDate && d < todayDate) {
    const dateStrVal = dateStr(d);
    const scheduled = activeHabits.filter(h => isHabitScheduledForDate(h, dateStrVal));
    if (scheduled.length > 0) {
      const completed = scheduled.filter(h =>
        (completions || []).some(c => c.habitId === h.id && c.date === dateStrVal)
      );
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
  const activeHabits = (habits || []).filter(h => !h.archived);
  if (activeHabits.length === 0) return { percent: 0, total: 0, completed: 0 };

  const [year, month] = m.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  let totalScheduled = 0;
  let totalCompleted = 0;
  const today = todayStr();

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStrVal = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (dateStrVal > today) break;

    for (const h of activeHabits) {
      if (isHabitScheduledForDate(h, dateStrVal)) {
        totalScheduled++;
        if ((completions || []).some(c => c.habitId === h.id && c.date === dateStrVal)) {
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

/**
 * Authoritative unified challenge scoring function.
 * Used by application (UI, reports, sync) and matches the database authoritative calculation.
 *
 * Scoring Formula:
 * - Consistency % = (completed scheduled habit occurrences / total scheduled habit occurrences) * 100
 * - Streak: consecutive calendar days with scheduled habit completions, walking back from today/yesterday
 * - Workouts: count of valid sessions with status = 'completed' within the challenge window
 */
export function calculateChallengeScores(challenge, habits = [], completions = [], workouts = [], referenceDate = null) {
  if (!challenge) {
    return {
      consistencyPercent: 0,
      currentStreak: 0,
      longestStreak: 0,
      workoutsCompleted: 0,
      challengeDay: 0,
      daysTracked: 0,
      totalScheduledOccurrences: 0,
      completedScheduledOccurrences: 0,
    };
  }

  const today = referenceDate || todayStr();
  const start = challenge.startDate;

  // Effective end date: bounded by challenge.endDate, challenge.completedAt, and today
  let end = today;
  if (challenge.status === 'completed' && challenge.completedAt) {
    const compDate = challenge.completedAt.slice(0, 10);
    end = compDate < today ? compDate : today;
  } else if (challenge.endDate && challenge.endDate < today) {
    end = challenge.endDate;
  }

  const challengeDay = getChallengeDay(challenge);
  const daysTracked = start <= end ? daysBetween(start, end) + 1 : 0;

  // Active participating habits: unarchived habits filtered by selectedHabitIds
  const selectedIds = Array.isArray(challenge.selectedHabitIds) && challenge.selectedHabitIds.length > 0
    ? new Set(challenge.selectedHabitIds)
    : null;

  const participatingHabits = (habits || []).filter(h =>
    !h.archived &&
    (selectedIds ? selectedIds.has(h.id) : true) &&
    (!challenge.userId || !h.userId || h.userId === challenge.userId)
  );

  // Bounded check: if start > end
  if (start > end) {
    return {
      consistencyPercent: 0,
      currentStreak: 0,
      perfectStreak: 0,
      longestStreak: 0,
      activityStreak: 0,
      longestActivityStreak: 0,
      workoutsCompleted: 0,
      challengeDay,
      daysTracked: 0,
      totalScheduledOccurrences: 0,
      completedScheduledOccurrences: 0,
    };
  }

  // Deduplicate completions within [start, end] for participating habits
  const completionsByDate = new Map();
  for (const c of (completions || [])) {
    if (c && c.habitId && c.date && c.date >= start && c.date <= end) {
      if (c.challengeId && c.challengeId !== challenge.id) continue;
      if (selectedIds && !selectedIds.has(c.habitId)) continue;

      if (!completionsByDate.has(c.date)) {
        completionsByDate.set(c.date, new Set());
      }
      completionsByDate.get(c.date).add(c.habitId);
    }
  }

  let totalScheduled = 0;
  let totalCompleted = 0;
  const perfectDaysSet = new Set();
  const activeDaysSet = new Set();

  // Index valid completed workouts by date
  const completedWorkoutsByDate = new Set();
  for (const w of (workouts || [])) {
    if (w && w.status === 'completed' && w.date && w.date >= start && w.date <= end) {
      completedWorkoutsByDate.add(w.date);
    }
  }

  const cur = new Date(start + 'T00:00:00');
  const endDateObj = new Date(end + 'T00:00:00');

  while (cur <= endDateObj) {
    const dStr = dateStr(cur);
    let dayScheduledCount = 0;
    let dayCompletedCount = 0;

    for (const h of participatingHabits) {
      if (isHabitScheduledForDate(h, dStr)) {
        dayScheduledCount++;
        totalScheduled++;
        if (completionsByDate.has(dStr) && completionsByDate.get(dStr).has(h.id)) {
          dayCompletedCount++;
          totalCompleted++;
        }
      }
    }

    // Perfect scheduled-habit day: all scheduled habits for the day were completed
    if (dayScheduledCount > 0 && dayCompletedCount >= dayScheduledCount) {
      perfectDaysSet.add(dStr);
    }

    // Activity day: at least one habit completed OR a workout completed
    if (dayCompletedCount > 0 || completedWorkoutsByDate.has(dStr)) {
      activeDaysSet.add(dStr);
    }

    cur.setDate(cur.getDate() + 1);
  }

  const consistencyPercent = totalScheduled > 0
    ? Math.min(100, Math.round((totalCompleted / totalScheduled) * 100))
    : 0;

  // Streak calculations (matches consecutive calendar day rules)
  const dYesterday = new Date(end + 'T00:00:00');
  dYesterday.setDate(dYesterday.getDate() - 1);
  const yesterday = dateStr(dYesterday);

  // 1. Perfect scheduled-habit day streak (strict challenge discipline)
  let perfectStreak = 0;
  const perfectStartCheck = perfectDaysSet.has(end)
    ? end
    : (perfectDaysSet.has(yesterday) ? yesterday : null);

  if (perfectStartCheck) {
    let curr = new Date(perfectStartCheck + 'T00:00:00');
    const minDate = new Date(start + 'T00:00:00');
    while (curr >= minDate && perfectDaysSet.has(dateStr(curr))) {
      perfectStreak++;
      curr.setDate(curr.getDate() - 1);
    }
  }

  // Longest perfect streak across challenge window
  const sortedPerfectDays = Array.from(perfectDaysSet).sort();
  let longestPerfectStreak = sortedPerfectDays.length > 0 ? 1 : 0;
  let perfectRun = 1;
  for (let i = 1; i < sortedPerfectDays.length; i++) {
    if (daysBetween(sortedPerfectDays[i - 1], sortedPerfectDays[i]) === 1) {
      perfectRun++;
    } else {
      perfectRun = 1;
    }
    if (perfectRun > longestPerfectStreak) {
      longestPerfectStreak = perfectRun;
    }
  }
  longestPerfectStreak = Math.max(longestPerfectStreak, perfectStreak);

  // 2. Activity streak (at least one habit or workout completed per day)
  let activityStreak = 0;
  const activeStartCheck = activeDaysSet.has(end)
    ? end
    : (activeDaysSet.has(yesterday) ? yesterday : null);

  if (activeStartCheck) {
    let curr = new Date(activeStartCheck + 'T00:00:00');
    const minDate = new Date(start + 'T00:00:00');
    while (curr >= minDate && activeDaysSet.has(dateStr(curr))) {
      activityStreak++;
      curr.setDate(curr.getDate() - 1);
    }
  }

  // Longest activity streak
  const sortedActiveDays = Array.from(activeDaysSet).sort();
  let longestActivityStreak = sortedActiveDays.length > 0 ? 1 : 0;
  let activeRun = 1;
  for (let i = 1; i < sortedActiveDays.length; i++) {
    if (daysBetween(sortedActiveDays[i - 1], sortedActiveDays[i]) === 1) {
      activeRun++;
    } else {
      activeRun = 1;
    }
    if (activeRun > longestActivityStreak) {
      longestActivityStreak = activeRun;
    }
  }
  longestActivityStreak = Math.max(longestActivityStreak, activityStreak);

  // Workouts: valid completed workouts within challenge range
  const workoutsCompleted = (workouts || []).filter(w =>
    w.status === 'completed' && w.date >= start && w.date <= end
  ).length;

  return {
    consistencyPercent,
    currentStreak: perfectStreak, // Authoritative perfect day streak
    perfectStreak,
    longestStreak: longestPerfectStreak,
    activityStreak,
    longestActivityStreak,
    workoutsCompleted,
    challengeDay,
    daysTracked,
    totalScheduledOccurrences: totalScheduled,
    completedScheduledOccurrences: totalCompleted,
  };
}

/**
 * Validates selected habit mutation rules.
 * Users cannot alter selected habits after challenge start date or once completions exist.
 */
export function validateSelectedHabitsMutation(challenge, newSelectedHabitIds, completions = [], referenceDate = null) {
  if (!challenge) return true;
  const current = referenceDate || todayStr();
  const oldIds = Array.isArray(challenge.selectedHabitIds) ? challenge.selectedHabitIds : [];
  const newIds = Array.isArray(newSelectedHabitIds) ? newSelectedHabitIds : [];

  // Check equality
  if (oldIds.length === newIds.length && oldIds.every((id, idx) => id === newIds[idx])) {
    return true;
  }

  // Rule A: Cannot modify after start date
  if (challenge.startDate && current > challenge.startDate) {
    throw new Error('selectedHabitIds cannot be modified after the challenge start date.');
  }

  // Rule B: Cannot modify once habit completions exist
  const hasCompletions = (completions || []).some(c => c && c.challengeId === challenge.id);
  if (hasCompletions) {
    throw new Error('selectedHabitIds cannot be modified once habit completions exist for this challenge.');
  }

  return true;
}

export function generateTransformationReport(challenge, state) {
  if (!challenge || !state) return null;
  const start = challenge.startDate;
  const today = todayStr();
  const end = challenge.status === 'completed' && challenge.completedAt
    ? challenge.completedAt.slice(0, 10)
    : (challenge.endDate && challenge.endDate < today ? challenge.endDate : today);

  const scores = calculateChallengeScores(
    challenge,
    state.habits || [],
    state.habitCompletions || [],
    state.workoutSessions || [],
    end
  );

  // Workouts in range (status === 'completed')
  const sessions = (state.workoutSessions || []).filter(
    w => w.status === 'completed' && w.date >= start && w.date <= end
  );
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
  const totalWater = waterEntries.reduce((sum, w) => sum + (Number(w.amount) || 0), 0);

  // Learning
  const learningSessions = (state.learningSessions || []).filter(l => l.date >= start && l.date <= end);
  const totalLearningMinutes = learningSessions.reduce((sum, l) => sum + (Number(l.duration) || 0), 0);

  // Mood and sleep
  const moods = (state.moodLogs || []).filter(m => m.date >= start && m.date <= end);
  const avgMood = moods.length > 0 ? (moods.reduce((s, m) => s + (Number(m.value) || 0), 0) / moods.length).toFixed(1) : null;
  const sleeps = (state.sleepLogs || []).filter(s => s.date >= start && s.date <= end);
  const avgSleep = sleeps.length > 0 ? (sleeps.reduce((s, sl) => s + (Number(sl.hours) || 0), 0) / sleeps.length).toFixed(1) : null;

  // Body weight delta
  const measurements = [...(state.bodyMeasurements || [])]
    .filter(m => m.date >= start && m.date <= end && m.weight)
    .sort((a, b) => a.date.localeCompare(b.date));
  const startWeight = measurements.length > 0 ? measurements[0].weight : null;
  const endWeight = measurements.length > 1 ? measurements[measurements.length - 1].weight : startWeight;
  const weightChange = (startWeight !== null && endWeight !== null) ? Number((endWeight - startWeight).toFixed(1)) : null;

  // Finance in range
  const transactions = (state.transactions || []).filter(t => t.date >= start && t.date <= end);
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const totalExpenses = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0);

  return {
    challengeName: challenge.name,
    mode: challenge.mode,
    startDate: start,
    endDate: end,
    daysTracked: scores.daysTracked,
    habitRate: scores.consistencyPercent,
    totalHabitsCompleted: scores.completedScheduledOccurrences,
    workoutCount: scores.workoutsCompleted,
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

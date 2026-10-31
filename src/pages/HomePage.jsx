import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import {
  getChallengeProgress,
  getPhase,
  getDailyCompletionRate,
  getCategoryCompletionRate,
  getWeekDates,
  getStreak,
  isHabitScheduledForDate,
  CHALLENGE_MODES,
} from '../utils/challenge';
import { todayStr, generateId } from '../utils/storage';
import {
  calculateDailyNutritionTotals,
  getNutritionTargetsForDate,
  calculateCalorieBalance,
} from '../utils/nutritionCalculations';
import { Card, ProgressRing, Badge, GlassCard, Button } from '../components/ui';
import TransformationReportModal from '../components/challenge/TransformationReportModal';
import {
  Dumbbell,
  Utensils,
  BookOpen,
  Brain,
  Wallet,
  Droplets,
  CheckCircle2,
  Circle,
  ChevronRight,
  Flame,
  Target,
  Trophy,
  Zap,
  Sun,
  Moon as MoonIcon,
  Sunset,
  Plus,
  FileText,
  Check,
  Sparkles,
  ArrowRight,
  Activity,
} from 'lucide-react';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return { text: 'Good morning', icon: Sun };
  if (h < 17) return { text: 'Good afternoon', icon: Sunset };
  return { text: 'Good evening', icon: MoonIcon };
}

const categoryConfig = {
  discipline: { label: 'Discipline', color: 'var(--color-discipline)', icon: Zap },
  body: { label: 'Body', color: 'var(--color-body)', icon: Dumbbell },
  mind: { label: 'Mind', color: 'var(--color-mind)', icon: Brain },
  learning: { label: 'Learning', color: 'var(--color-learning)', icon: BookOpen },
  nutrition: { label: 'Nutrition', color: 'var(--color-nutrition)', icon: Utensils },
  money: { label: 'Money', color: 'var(--color-money)', icon: Wallet },
};

function WeeklyDisciplineChart({ data, today }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  return (
    <div
      role="region"
      aria-label="Weekly habit completion chart"
      className="w-full h-[170px] flex flex-col justify-end pt-2 pb-1 select-none"
    >
      {/* Bars track container */}
      <div className="flex-1 flex items-end justify-between gap-2 sm:gap-3 px-1 sm:px-3 pb-2 border-b border-white/[0.06]">
        {data.map((item, idx) => {
          const isToday = item.date === today;
          const isHovered = hoveredIdx === idx;
          const heightPct = Math.max(8, item.percent);

          return (
            <div
              key={item.day + item.date}
              className="flex-1 flex flex-col items-center justify-end h-full relative group cursor-pointer"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onFocus={() => setHoveredIdx(idx)}
              onBlur={() => setHoveredIdx(null)}
              tabIndex={0}
              role="img"
              aria-label={`${item.day}: ${item.percent}% (${item.completed} of ${item.total} habits)`}
            >
              {/* Floating Tooltip */}
              {isHovered && (
                <div
                  role="tooltip"
                  className="absolute -top-11 z-20 px-2.5 py-1 rounded-xl bg-[var(--color-bg-secondary)]/95 backdrop-blur-xl border border-[var(--color-border-primary)] shadow-[0_8px_24px_rgba(0,0,0,0.6)] text-center pointer-events-none whitespace-nowrap animate-in fade-in zoom-in-95 duration-150"
                >
                  <p className="text-[11px] font-bold text-[var(--color-text-primary)]">
                    {item.percent}% <span className="font-normal text-[var(--color-text-tertiary)]">({item.completed}/{item.total})</span>
                  </p>
                  <p className="text-[9px] text-[var(--color-accent)] font-semibold uppercase tracking-wider">
                    {item.day} {isToday ? '• Today' : ''}
                  </p>
                </div>
              )}

              {/* Bar track and fill */}
              <div className="w-full max-w-[32px] h-full flex items-end justify-center rounded-xl bg-white/[0.025] hover:bg-white/[0.05] p-0.5 transition-colors">
                <div
                  className={`w-full rounded-lg transition-all duration-300 ${
                    item.percent > 0
                      ? isToday
                        ? 'bg-gradient-to-t from-[#65a30d] to-[var(--color-accent)] shadow-[0_0_12px_rgba(132,204,22,0.35)]'
                        : 'bg-[var(--color-accent)]/85 hover:bg-[var(--color-accent)]'
                      : 'bg-white/[0.08]'
                  }`}
                  style={{
                    height: `${heightPct}%`,
                    opacity: item.percent === 0 ? 0.35 : 1,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* X-Axis Day Labels */}
      <div className="flex justify-between gap-2 sm:gap-3 px-1 sm:px-3 pt-2">
        {data.map((item) => {
          const isToday = item.date === today;
          return (
            <div key={item.day} className="flex-1 text-center">
              <span
                className={`text-[11px] font-semibold transition-colors ${
                  isToday
                    ? 'text-[var(--color-accent)] font-bold'
                    : 'text-[var(--color-text-tertiary)]'
                }`}
              >
                {item.day}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const today = todayStr();
  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;
  const [showReport, setShowReport] = useState(false);
  const [waterToast, setWaterToast] = useState(false);
  const [hasActiveWorkout, setHasActiveWorkout] = useState(false);

  useEffect(() => {
    try {
      setHasActiveWorkout(Boolean(localStorage.getItem('bm90_active_workout')));
    } catch {
      setHasActiveWorkout(false);
    }
  }, []);

  const activeChallenge = useMemo(
    () => state.challenges.find((c) => c.status === 'active'),
    [state.challenges]
  );

  const challengeProgress = useMemo(
    () => (activeChallenge ? getChallengeProgress(activeChallenge) : null),
    [activeChallenge]
  );

  const phase = useMemo(
    () => (activeChallenge ? getPhase(activeChallenge) : null),
    [activeChallenge]
  );

  const todayHabits = useMemo(() => {
    return state.habits.filter((h) => !h.archived && isHabitScheduledForDate(h, today));
  }, [state.habits, today]);

  const dailyRate = useMemo(
    () => getDailyCompletionRate(state.habits, state.habitCompletions, today),
    [state.habits, state.habitCompletions, today]
  );

  const categoryScores = useMemo(() => {
    return Object.keys(categoryConfig).map((cat) => {
      const rate = getCategoryCompletionRate(cat, state.habits, state.habitCompletions, today);
      return {
        key: cat,
        ...categoryConfig[cat],
        ...rate,
      };
    });
  }, [state.habits, state.habitCompletions, today]);

  const weekData = useMemo(() => {
    const dates = getWeekDates();
    return dates.map((date) => {
      const rate = getDailyCompletionRate(state.habits, state.habitCompletions, date);
      const d = new Date(date + 'T00:00:00');
      return {
        day: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()],
        date,
        percent: rate.percent,
        completed: rate.completed,
        total: rate.total,
      };
    });
  }, [state.habits, state.habitCompletions]);

  // Centralized nutrition metrics for today
  const nutritionTargets = useMemo(() => getNutritionTargetsForDate(state, today), [state, today]);
  const nutritionTotals = useMemo(
    () => calculateDailyNutritionTotals(state.mealEntries || [], today),
    [state.mealEntries, today]
  );
  const calorieBalance = useMemo(
    () => calculateCalorieBalance(nutritionTargets.calories, nutritionTotals.calories),
    [nutritionTargets.calories, nutritionTotals.calories]
  );

  function toggleHabit(habitId) {
    dispatch({ type: 'TOGGLE_HABIT_COMPLETION', payload: { habitId, date: today } });
  }

  const isCompleted = (habitId) =>
    state.habitCompletions.some((c) => c.habitId === habitId && c.date === today);

  const formatDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      {/* Welcome & Challenge Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[var(--color-text-secondary)] mb-1">
            <GreetingIcon size={16} className="text-amber-400" />
            <span className="text-xs sm:text-sm font-medium tracking-wide uppercase">
              {greeting.text}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
            {state.profile.name ? state.profile.name : 'Welcome to Beastmode'}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-tertiary)] mt-0.5">
            {formatDate(today)}
          </p>
        </div>

        {activeChallenge && challengeProgress && (
          <div className="flex items-center gap-3 self-start sm:self-center">
            <button
              onClick={() => setShowReport(true)}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-white/[0.08] hover:border-white/[0.18] transition-all"
            >
              <Badge color={CHALLENGE_MODES[activeChallenge.mode]?.color || 'var(--color-accent)'}>
                {CHALLENGE_MODES[activeChallenge.mode]?.name}
              </Badge>
              <div className="text-left">
                <p className="text-xs font-bold text-[var(--color-text-primary)] leading-tight">
                  Day {challengeProgress.day} of {challengeProgress.total}
                </p>
                <p className="text-[10px] text-[var(--color-accent)] font-medium flex items-center gap-0.5">
                  Report <ChevronRight size={10} />
                </p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Phase indicator for Beast Mode */}
      {phase && (
        <GlassCard
          className="flex flex-col sm:flex-row sm:items-center gap-4 cursor-pointer hover:border-white/[0.16] transition-all"
          onClick={() => setShowReport(true)}
        >
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/10 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400 shadow-[0_2px_12px_rgba(245,158,11,0.2)]">
            <Flame size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold tracking-widest text-[var(--color-text-tertiary)] uppercase">
                Phase {phase.number}
              </span>
              <span className="w-1 h-1 rounded-full bg-white/20" />
              <span className="text-[11px] text-[var(--color-accent)] font-semibold hover:underline">
                View Transformation Report
              </span>
            </div>
            <p className="font-extrabold text-base text-[var(--color-text-primary)] mt-0.5">
              {phase.name}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              Days {phase.range} · {phase.daysIn} of {phase.daysTotal} days logged in this phase
            </p>
          </div>
          <div className="w-full sm:w-36 flex flex-col gap-1.5 shrink-0">
            <div className="flex justify-between text-[11px] font-medium text-[var(--color-text-tertiary)]">
              <span>Progress</span>
              <span>{Math.round((phase.daysIn / phase.daysTotal) * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-white/[0.08] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[#a3e635] rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(132,204,22,0.4)]"
                style={{ width: `${(phase.daysIn / phase.daysTotal) * 100}%` }}
              />
            </div>
          </div>
        </GlassCard>
      )}

      {/* Daily Progress + Today's Habits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Apple Fitness Activity Ring Style Card */}
        <Card className="lg:col-span-1 flex flex-col items-center justify-center py-8 text-center">
          <div className="relative mb-4">
            <ProgressRing percent={dailyRate.percent} size={136} strokeWidth={10}>
              <div className="text-center">
                <span className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
                  {dailyRate.percent}%
                </span>
                <span className="block text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-0.5">
                  Today
                </span>
              </div>
            </ProgressRing>
          </div>
          <h3 className="text-base font-bold text-[var(--color-text-primary)]">Daily Discipline</h3>
          <p className="text-xs font-medium text-[var(--color-text-secondary)] mt-1">
            {dailyRate.completed} of {dailyRate.total} habits completed
          </p>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-[var(--color-accent)] font-semibold">
            <Sparkles size={14} />
            <span>{dailyRate.percent === 100 ? 'All habits completed! Beast mode unlocked!' : `${dailyRate.total - dailyRate.completed} habits left to conquer`}</span>
          </div>
        </Card>

        {/* Today's Habits Checklist */}
        <Card className="lg:col-span-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                  Today's Habits
                </h3>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Tap to log completion for {formatDate(today)}
                </p>
              </div>
              <button
                onClick={() => navigate('/habits')}
                className="text-xs font-semibold text-[var(--color-accent)] hover:underline flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--color-accent-dim)]"
              >
                View all <ChevronRight size={14} />
              </button>
            </div>

            {todayHabits.length === 0 ? (
              <div className="py-8 text-center border border-dashed border-white/[0.08] rounded-2xl">
                <p className="text-xs text-[var(--color-text-tertiary)]">
                  No habits scheduled for today
                </p>
                <Button size="sm" variant="ghost" onClick={() => navigate('/habits')} className="mt-2 text-xs">
                  + Add or schedule habits
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {todayHabits.map((habit) => {
                  const done = isCompleted(habit.id);
                  return (
                    <motion.button
                      key={habit.id}
                      onClick={() => toggleHabit(habit.id)}
                      className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-2xl text-left text-sm transition-all duration-200 border ${
                        done
                          ? 'bg-[var(--color-accent-dim)]/50 border-[var(--color-accent)]/30 text-[var(--color-text-primary)]'
                          : 'bg-white/[0.03] border-white/[0.06] text-[var(--color-text-secondary)] hover:bg-white/[0.06] hover:text-[var(--color-text-primary)]'
                      }`}
                      whileTap={{ scale: 0.985 }}
                    >
                      <div className="shrink-0">
                        {done ? (
                          <div className="w-5 h-5 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-black">
                            <Check size={13} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border-2 border-white/30 flex items-center justify-center" />
                        )}
                      </div>
                      <span className="text-base leading-none mr-0.5">{habit.icon || '📌'}</span>
                      <div className="flex-1 min-w-0">
                        <span
                          className={`font-semibold block truncate ${
                            done ? 'line-through opacity-70 text-[var(--color-text-tertiary)]' : ''
                          }`}
                        >
                          {habit.name}
                        </span>
                        {habit.target && (
                          <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                            Target: {habit.target}
                          </span>
                        )}
                      </div>
                      {done && (
                        <span className="text-[10px] font-bold text-[var(--color-accent)] uppercase tracking-wider shrink-0">
                          Done
                        </span>
                      )}
                    </motion.button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Life Balance (Apple Health Style Vector Rings) */}
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-base text-[var(--color-text-primary)]">Life Balance</h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Pillar completion distribution for today
            </p>
          </div>
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            6 Core Pillars
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categoryScores.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.key}
                className="flex flex-col items-center text-center p-3 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors"
              >
                <ProgressRing
                  percent={cat.hasHabits ? cat.percent : 0}
                  size={58}
                  strokeWidth={5}
                  color={cat.hasHabits ? cat.color : 'rgba(255, 255, 255, 0.08)'}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{
                      background: cat.hasHabits ? `${cat.color}22` : 'rgba(255, 255, 255, 0.04)',
                      color: cat.hasHabits ? cat.color : 'var(--color-text-tertiary)',
                    }}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </div>
                </ProgressRing>

                <p className="text-xs font-bold text-[var(--color-text-primary)] mt-2">
                  {cat.label}
                </p>
                <p
                  className={`text-[11px] font-semibold mt-0.5 ${
                    cat.hasHabits
                      ? 'text-[var(--color-text-secondary)]'
                      : 'text-[var(--color-text-tertiary)]'
                  }`}
                >
                  {cat.hasHabits ? `${cat.percent}%` : '—'}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Weekly Chart + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Weekly Completion Bar Chart */}
        <Card className="flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">This Week</h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Daily discipline rates (Sun – Sat)
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)]" />
              <span>Completion Rate</span>
            </div>
          </div>

          <WeeklyDisciplineChart data={weekData} today={today} />
        </Card>

        {/* Quick Actions Grid */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">Quick Actions</h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Fast logging and tracking shortcuts
              </p>
            </div>
            {waterToast && (
              <span className="text-xs text-[var(--color-accent)] font-semibold flex items-center gap-1 animate-pulse px-2.5 py-1 rounded-full bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/30">
                <Check size={12} strokeWidth={3} /> +250ml Water Logged
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => navigate('/train')}
              className={`flex items-center gap-3 p-3 rounded-2xl border transition-all text-left ${
                hasActiveWorkout
                  ? 'bg-[var(--color-accent-dim)]/20 border-[var(--color-accent)]/30 hover:border-[var(--color-accent)]/50 shadow-[0_0_16px_rgba(132,204,22,0.1)]'
                  : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12]'
              }`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                hasActiveWorkout
                  ? 'bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 text-[var(--color-accent)]'
                  : 'bg-rose-500/15 border border-rose-500/20 text-rose-400'
              }`}>
                <Dumbbell size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  {hasActiveWorkout && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
                  )}
                  <span className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] block truncate">
                    {hasActiveWorkout ? 'Resume Workout' : 'Start Workout'}
                  </span>
                </div>
                <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                  {hasActiveWorkout ? 'Workout in progress' : 'Log training'}
                </span>
              </div>
            </button>

            <button
              onClick={() => navigate('/nutrition')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-green-500/15 border border-green-500/20 text-green-400 shrink-0">
                <Utensils size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] block truncate">
                  Log Meal
                </span>
                <span className="text-[10px] text-[var(--color-accent)] font-semibold block mt-0.5 truncate">
                  {calorieBalance.remaining >= 0
                    ? `${calorieBalance.remaining} cal left`
                    : `${calorieBalance.overAmount} cal over`}
                </span>
              </div>
            </button>

            <button
              onClick={() => {
                dispatch({
                  type: 'ADD_WATER_ENTRY',
                  payload: {
                    id: generateId(),
                    date: today,
                    amount: 250,
                    unit: 'ml',
                    createdAt: new Date().toISOString(),
                  },
                });
                setWaterToast(true);
                setTimeout(() => setWaterToast(false), 2000);
              }}
              className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-500/15 border border-sky-500/20 text-sky-400 shrink-0">
                  <Droplets size={18} strokeWidth={2} />
                </div>
                <div className="min-w-0">
                  <span className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] block truncate">
                    +250ml Water
                  </span>
                  <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                    Hydrate
                  </span>
                </div>
              </div>
              <span className="text-[10px] text-[var(--color-accent)] font-bold px-1.5 py-0.5 rounded-md bg-[var(--color-accent-dim)] shrink-0">
                +1
              </span>
            </button>

            <button
              onClick={() => navigate('/learning')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-500/15 border border-amber-500/20 text-amber-400 shrink-0">
                <BookOpen size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] block truncate">
                  Learning
                </span>
                <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                  Deep work timer
                </span>
              </div>
            </button>

            <button
              onClick={() => navigate('/mind')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-500/15 border border-purple-500/20 text-purple-400 shrink-0">
                <Brain size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] block truncate">
                  Journal & Mind
                </span>
                <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                  Mood & meditate
                </span>
              </div>
            </button>

            <button
              onClick={() => navigate('/money')}
              className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12] transition-all text-left"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-cyan-500/15 border border-cyan-500/20 text-cyan-400 shrink-0">
                <Wallet size={18} strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <span className="text-xs sm:text-sm font-bold text-[var(--color-text-primary)] block truncate">
                  Expenses
                </span>
                <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                  Finance tracker
                </span>
              </div>
            </button>
          </div>
        </Card>
      </div>

      {/* Streaks */}
      {todayHabits.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                Active Streaks
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Consecutive days of consistency
              </p>
            </div>
            <span className="text-xs font-semibold text-[var(--color-accent)] flex items-center gap-1">
              <Flame size={14} className="text-orange-400" /> Keep momentum
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {todayHabits.slice(0, 8).map((h) => {
              const s = getStreak(h.id, state.habitCompletions);
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-colors"
                >
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                      s.current > 0
                        ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                        : 'bg-white/[0.04] text-[var(--color-text-tertiary)]'
                    }`}
                  >
                    <Flame size={14} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                      {h.name}
                    </p>
                    <p className="text-[10px] font-semibold text-[var(--color-text-tertiary)] mt-0.5">
                      {s.current} day{s.current !== 1 ? 's' : ''} in a row
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Transformation Report Modal */}
      {activeChallenge && (
        <TransformationReportModal
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          challenge={activeChallenge}
          state={state}
          onStartNew={() => {
            setShowReport(false);
            navigate('/settings');
          }}
        />
      )}
    </div>
  );
}

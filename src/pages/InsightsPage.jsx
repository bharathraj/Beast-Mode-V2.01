import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { todayStr } from '../utils/storage';
import { calculateDailyNutritionTotals } from '../utils/nutritionCalculations';
import {
  getDailyCompletionRate,
  getWeekDates,
  getCategoryScore,
  CHALLENGE_MODES,
  getChallengeProgress,
  getPhase,
  getMissedDays,
} from '../utils/challenge';
import { Card, PageHeader, Badge, ProgressRing, GlassCard, Button } from '../components/ui';
import TransformationReportModal from '../components/challenge/TransformationReportModal';
import {
  BarChart3,
  TrendingUp,
  Flame,
  Dumbbell,
  Utensils,
  BookOpen,
  Brain,
  Wallet,
  Moon,
  Activity,
  Target,
  Calendar,
  ChevronRight,
  FileText,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Area,
  AreaChart,
} from 'recharts';

export default function InsightsPage() {
  const { state } = useStore();
  const today = todayStr();
  const [showReport, setShowReport] = useState(false);

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

  // Weekly completion data (4 weeks)
  const weeklyData = useMemo(() => {
    const weeks = [];
    for (let w = 3; w >= 0; w--) {
      const dates = getWeekDates(-w);
      let totalPct = 0;
      let count = 0;
      dates.forEach((d) => {
        const rate = getDailyCompletionRate(state.habits, state.habitCompletions, d);
        if (rate.total > 0) {
          totalPct += rate.percent;
          count++;
        }
      });
      weeks.push({
        label: w === 0 ? 'This Week' : w === 1 ? 'Last Week' : `${w}w ago`,
        percent: count > 0 ? Math.round(totalPct / count) : 0,
      });
    }
    return weeks;
  }, [state.habits, state.habitCompletions]);

  // Daily trend for this week
  const dailyTrend = useMemo(() => {
    const dates = getWeekDates();
    return dates.map((d) => {
      const rate = getDailyCompletionRate(state.habits, state.habitCompletions, d);
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
        new Date(d + 'T00:00:00').getDay()
      ];
      return { day: dayName, date: d, percent: rate.percent };
    });
  }, [state.habits, state.habitCompletions]);

  // Category scores with vector icons
  const categories = useMemo(() => {
    const cats = [
      { key: 'discipline', label: 'Discipline', icon: Zap, color: 'var(--color-discipline)' },
      { key: 'body', label: 'Body', icon: Dumbbell, color: 'var(--color-body)' },
      { key: 'mind', label: 'Mind', icon: Brain, color: 'var(--color-mind)' },
      { key: 'learning', label: 'Learning', icon: BookOpen, color: 'var(--color-learning)' },
      { key: 'nutrition', label: 'Nutrition', icon: Utensils, color: 'var(--color-nutrition)' },
      { key: 'money', label: 'Money', icon: Wallet, color: 'var(--color-money)' },
    ];
    return cats.map((c) => ({
      ...c,
      score7: getCategoryScore(c.key, state.habits, state.habitCompletions, 7),
      score30: getCategoryScore(c.key, state.habits, state.habitCompletions, 30),
    }));
  }, [state.habits, state.habitCompletions]);

  // Workout stats
  const workoutStats = useMemo(() => {
    const sessions = state.workoutSessions || [];
    const thisWeek = getWeekDates();
    const thisWeekSessions = sessions.filter((s) => thisWeek.includes(s.date));
    const totalVolume = sessions.reduce((sum, s) => {
      let vol = 0;
      (s.exercises || []).forEach((ex) =>
        (ex.sets || []).forEach((set) => {
          if (set.completed && set.weight && set.reps)
            vol += parseFloat(set.weight) * parseInt(set.reps);
        })
      );
      return sum + vol;
    }, 0);
    return {
      total: sessions.length,
      thisWeek: thisWeekSessions.length,
      totalVolume,
    };
  }, [state.workoutSessions]);

  // Nutrition stats
  const nutritionStats = useMemo(() => {
    const todayTotals = calculateDailyNutritionTotals(state.mealEntries || [], today);
    const water = (state.waterEntries || [])
      .filter((w) => w.date === today)
      .reduce((s, w) => s + (Number(w.amount) || 0), 0);
    return { calories: todayTotals.calories, protein: Math.round(todayTotals.protein), water };
  }, [state.mealEntries, state.waterEntries, today]);

  // Learning stats
  const learningStats = useMemo(() => {
    const sessions = state.learningSessions || [];
    const thisWeek = getWeekDates();
    const weekMin = sessions
      .filter((s) => thisWeek.includes(s.date))
      .reduce((sum, s) => sum + (s.duration || 0), 0);
    const totalMin = sessions.reduce((sum, s) => sum + (s.duration || 0), 0);
    return { weekMinutes: weekMin, totalMinutes: totalMin, sessions: sessions.length };
  }, [state.learningSessions]);

  // Mood trend
  const moodTrend = useMemo(() => {
    const logs = [...(state.moodLogs || [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14);
    return logs.map((l) => ({
      date: l.date.slice(5),
      value: l.value,
    }));
  }, [state.moodLogs]);

  // Sleep avg
  const sleepAvg = useMemo(() => {
    const logs = state.sleepLogs || [];
    if (logs.length === 0) return 0;
    const recent = logs.slice(-7);
    return (recent.reduce((s, l) => s + l.hours, 0) / recent.length).toFixed(1);
  }, [state.sleepLogs]);

  // Finance
  const financeStats = useMemo(() => {
    const trans = state.transactions || [];
    const month = today.slice(0, 7);
    const monthTrans = trans.filter((t) => t.date.startsWith(month));
    const income = monthTrans.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expenses = monthTrans
      .filter((t) => t.type === 'expense')
      .reduce((s, t) => s + t.amount, 0);
    return { income, expenses, net: income - expenses };
  }, [state.transactions, today]);

  // Missed days
  const missedDays = useMemo(
    () =>
      activeChallenge
        ? getMissedDays(activeChallenge, state.habits, state.habitCompletions)
        : [],
    [activeChallenge, state.habits, state.habitCompletions]
  );

  const thisWeekRate = weeklyData[weeklyData.length - 1]?.percent || 0;
  const lastWeekRate = weeklyData[weeklyData.length - 2]?.percent || 0;
  const weekDelta = thisWeekRate - lastWeekRate;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights & Analytics"
        subtitle="Comprehensive trend analysis across physical and mental performance"
      />

      {/* Challenge Status */}
      {activeChallenge && challengeProgress && (
        <GlassCard className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            <ProgressRing
              percent={challengeProgress.percent}
              size={68}
              strokeWidth={6}
              color={CHALLENGE_MODES[activeChallenge.mode]?.color}
            >
              <span className="text-sm font-black text-[var(--color-text-primary)]">
                {challengeProgress.percent}%
              </span>
            </ProgressRing>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge color={CHALLENGE_MODES[activeChallenge.mode]?.color}>
                  {CHALLENGE_MODES[activeChallenge.mode]?.name}
                </Badge>
                {phase && (
                  <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">
                    Phase {phase.number}: {phase.name}
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-[var(--color-text-primary)]">
                Day {challengeProgress.day} of {challengeProgress.total} · {challengeProgress.remaining} days remaining
              </p>
              {missedDays.length > 0 && (
                <p className="text-xs font-semibold text-rose-400 mt-0.5">
                  {missedDays.length} missed day{missedDays.length > 1 ? 's' : ''} logged
                </p>
              )}
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowReport(true)}
            className="self-start sm:self-auto shrink-0"
          >
            <FileText size={14} /> Full Transformation Report
          </Button>
        </GlassCard>
      )}

      {/* Key Metrics Grid (Apple Health Style Stat Tiles) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Habit Rate
            </span>
            <div className="w-8 h-8 rounded-xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 flex items-center justify-center text-[var(--color-accent)]">
              <Activity size={16} />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              {thisWeekRate}%
            </p>
            <div className="flex items-center gap-1 mt-1">
              {weekDelta !== 0 ? (
                <span
                  className={`text-[11px] font-bold flex items-center ${
                    weekDelta > 0 ? 'text-[var(--color-accent)]' : 'text-rose-400'
                  }`}
                >
                  {weekDelta > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                  {Math.abs(weekDelta)}% vs last week
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-[var(--color-text-tertiary)]">
                  Matches last week
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Training
            </span>
            <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Dumbbell size={16} />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              {workoutStats.thisWeek}
            </p>
            <p className="text-xs font-semibold text-[var(--color-text-tertiary)] mt-1">
              Workouts this week · {workoutStats.total} total
            </p>
          </div>
        </Card>

        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Deep Work
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <BookOpen size={16} />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              {learningStats.weekMinutes}
              <span className="text-sm font-semibold text-[var(--color-text-secondary)] ml-1">min</span>
            </p>
            <p className="text-xs font-semibold text-[var(--color-text-tertiary)] mt-1">
              Learning this week ({Math.round(learningStats.totalMinutes / 60)}h total)
            </p>
          </div>
        </Card>

        <Card className="p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
              Sleep Avg
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Moon size={16} />
            </div>
          </div>
          <div>
            <p className="text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              {sleepAvg}
              <span className="text-sm font-semibold text-[var(--color-text-secondary)] ml-1">hrs</span>
            </p>
            <p className="text-xs font-semibold text-[var(--color-text-tertiary)] mt-1">
              7-day average sleep duration
            </p>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                Daily Completion
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Current week habit execution rate
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={165}>
            <BarChart data={dailyTrend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--color-text-tertiary)' }}
              />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(20, 20, 25, 0.95)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '14px',
                  fontSize: '12px',
                }}
                formatter={(val) => [`${val}%`, 'Completion']}
              />
              <Bar dataKey="percent" fill="var(--color-accent)" radius={[8, 8, 8, 8]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                Weekly Trend
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Rolling 4-week consistency curve
              </p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={165}>
            <AreaChart data={weeklyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="insightWeekGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }}
              />
              <YAxis hide domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(20, 20, 25, 0.95)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '14px',
                  fontSize: '12px',
                }}
                formatter={(val) => [`${val}%`, 'Avg Completion']}
              />
              <Area
                type="monotone"
                dataKey="percent"
                stroke="var(--color-accent)"
                fill="url(#insightWeekGrad)"
                strokeWidth={2.5}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Category Breakdown (7d / 30d) with Vector Icons */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-base text-[var(--color-text-primary)]">
              Life Balance (7-Day vs 30-Day)
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
              Long-term stability across each pillar
            </p>
          </div>
          <span className="text-xs font-semibold text-[var(--color-text-secondary)]">
            7d / 30d
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <div
                key={cat.key}
                className="flex flex-col items-center text-center p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.05]"
              >
                <ProgressRing percent={cat.score7} size={58} strokeWidth={5} color={cat.color}>
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center"
                    style={{ background: `${cat.color}22`, color: cat.color }}
                  >
                    <Icon size={14} strokeWidth={2.2} />
                  </div>
                </ProgressRing>
                <p className="text-xs font-bold text-[var(--color-text-primary)] mt-2">
                  {cat.label}
                </p>
                <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] mt-0.5">
                  {cat.score7}% <span className="text-[var(--color-text-tertiary)] font-normal">/ {cat.score30}%</span>
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-green-500/15 border border-green-500/20 flex items-center justify-center text-green-400">
              <Utensils size={16} />
            </div>
            <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Today's Nutrition</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-white/[0.05]">
              <span className="text-[var(--color-text-secondary)]">Calories</span>
              <span className="font-bold text-[var(--color-text-primary)]">{nutritionStats.calories} kcal</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/[0.05]">
              <span className="text-[var(--color-text-secondary)]">Protein</span>
              <span className="font-bold text-[var(--color-text-primary)]">{nutritionStats.protein}g</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--color-text-secondary)]">Hydration</span>
              <span className="font-bold text-sky-400">{nutritionStats.water} ml</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Wallet size={16} />
            </div>
            <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Finance (This Month)</h3>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between py-1 border-b border-white/[0.05]">
              <span className="text-[var(--color-text-secondary)]">Income</span>
              <span className="font-bold text-[var(--color-accent)]">${financeStats.income.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-white/[0.05]">
              <span className="text-[var(--color-text-secondary)]">Expenses</span>
              <span className="font-bold text-rose-400">${financeStats.expenses.toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-[var(--color-text-secondary)]">Net Cash Flow</span>
              <span className={`font-bold ${financeStats.net >= 0 ? 'text-[var(--color-accent)]' : 'text-rose-400'}`}>
                ${financeStats.net.toLocaleString()}
              </span>
            </div>
          </div>
        </Card>

        {moodTrend.length > 0 && (
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/20 flex items-center justify-center text-purple-400">
                <Brain size={16} />
              </div>
              <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Mood Trend (14d)</h3>
            </div>
            <ResponsiveContainer width="100%" height={85}>
              <LineChart data={moodTrend}>
                <XAxis dataKey="date" hide />
                <YAxis hide domain={[1, 5]} />
                <Tooltip
                  contentStyle={{
                    background: 'rgba(20, 20, 25, 0.95)',
                    backdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '12px',
                    fontSize: '12px',
                  }}
                  formatter={(val) => [['', 'Bad', 'Low', 'Okay', 'Good', 'Great'][val], 'Mood']}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-mind)"
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: 'var(--color-mind)' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>

      {activeChallenge && (
        <TransformationReportModal
          isOpen={showReport}
          onClose={() => setShowReport(false)}
          challenge={activeChallenge}
          state={state}
        />
      )}
    </div>
  );
}

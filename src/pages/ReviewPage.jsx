import { useState, useMemo } from 'react';
import { useStore } from '../store/StoreContext';
import { generateId, todayStr } from '../utils/storage';
import { getDailyCompletionRate, getWeekDates } from '../utils/challenge';
import { Card, Button, Modal, PageHeader, EmptyState, Badge } from '../components/ui';
import {
  CalendarCheck,
  Plus,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Sparkles,
  Star,
  CheckCircle,
  AlertCircle,
  ArrowRight,
} from 'lucide-react';

export default function ReviewPage() {
  const { state, dispatch } = useStore();
  const today = todayStr();
  const [showForm, setShowForm] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);

  // Review form
  const [wentWell, setWentWell] = useState('');
  const [difficult, setDifficult] = useState('');
  const [changeNext, setChangeNext] = useState('');
  const [priority, setPriority] = useState('');
  const [rating, setRating] = useState(3);

  const reviews = state.weeklyReviews || [];

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => {
    const start = new Date(weekDates[0] + 'T00:00:00');
    const end = new Date(weekDates[6] + 'T00:00:00');
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekDates]);

  const weekStats = useMemo(() => {
    let totalPct = 0;
    let count = 0;
    weekDates.forEach((d) => {
      const rate = getDailyCompletionRate(state.habits, state.habitCompletions, d);
      if (rate.total > 0) {
        totalPct += rate.percent;
        count++;
      }
    });
    const avgCompletion = count > 0 ? Math.round(totalPct / count) : 0;

    const weekWorkouts = (state.workoutSessions || []).filter((s) =>
      weekDates.includes(s.date)
    ).length;
    const weekLearning = (state.learningSessions || [])
      .filter((s) => weekDates.includes(s.date))
      .reduce((sum, s) => sum + (s.duration || 0), 0);
    const weekMeals = (state.mealEntries || []).filter((m) =>
      weekDates.includes(m.date)
    ).length;
    const weekMoods = (state.moodLogs || []).filter((m) => weekDates.includes(m.date));
    const avgMood =
      weekMoods.length > 0
        ? (weekMoods.reduce((s, m) => s + m.value, 0) / weekMoods.length).toFixed(1)
        : '—';

    return { avgCompletion, weekWorkouts, weekLearning, weekMeals, avgMood };
  }, [state, weekDates]);

  const weekReview = useMemo(
    () => reviews.find((r) => r.weekStart === weekDates[0]),
    [reviews, weekDates]
  );

  function saveReview() {
    dispatch({
      type: 'ADD_WEEKLY_REVIEW',
      payload: {
        id: generateId(),
        weekStart: weekDates[0],
        weekEnd: weekDates[6],
        wentWell: wentWell.trim(),
        difficult: difficult.trim(),
        changeNext: changeNext.trim(),
        priority: priority.trim(),
        rating,
        stats: { ...weekStats },
        createdAt: new Date().toISOString(),
      },
    });
    setWentWell('');
    setDifficult('');
    setChangeNext('');
    setPriority('');
    setRating(3);
    setShowForm(false);
  }

  function openNewReview() {
    if (weekReview) {
      setWentWell(weekReview.wentWell || '');
      setDifficult(weekReview.difficult || '');
      setChangeNext(weekReview.changeNext || '');
      setPriority(weekReview.priority || '');
      setRating(weekReview.rating || 3);
    } else {
      setWentWell('');
      setDifficult('');
      setChangeNext('');
      setPriority('');
      setRating(3);
    }
    setShowForm(true);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Retrospective"
        subtitle="Evaluate performance metrics, extract lessons, and sharpen weekly priorities"
      />

      {/* Week Selector Bar */}
      <Card className="flex items-center justify-between p-3.5 sm:p-4">
        <button
          onClick={() => setWeekOffset((w) => w - 1)}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <ChevronLeft size={18} />
        </button>

        <div className="text-center">
          <p className="font-extrabold text-sm sm:text-base text-[var(--color-text-primary)]">
            {weekLabel}
          </p>
          <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-0.5">
            {weekOffset === 0
              ? 'Current Active Week'
              : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) > 1 ? 's' : ''} ago`}
          </p>
        </div>

        <button
          onClick={() => setWeekOffset((w) => w + 1)}
          disabled={weekOffset >= 0}
          className="w-9 h-9 rounded-xl flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-20 transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </Card>

      {/* Week Performance Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Card className="text-center p-4">
          <p className="text-2xl font-black text-[var(--color-accent)] font-mono">
            {weekStats.avgCompletion}%
          </p>
          <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-1">
            Habits Avg
          </p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-black text-rose-400 font-mono">
            {weekStats.weekWorkouts}
          </p>
          <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-1">
            Workouts
          </p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-black text-amber-400 font-mono">
            {weekStats.weekLearning}
            <span className="text-xs font-normal">m</span>
          </p>
          <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-1">
            Deep Work
          </p>
        </Card>
        <Card className="text-center p-4">
          <p className="text-2xl font-black text-green-400 font-mono">
            {weekStats.weekMeals}
          </p>
          <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-1">
            Meals Logged
          </p>
        </Card>
        <Card className="text-center p-4 col-span-2 sm:col-span-1">
          <p className="text-2xl font-black text-sky-400 font-mono">
            {weekStats.avgMood}
          </p>
          <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-1">
            Avg Mood
          </p>
        </Card>
      </div>

      {/* Daily Breakdown */}
      <Card className="p-5">
        <h3 className="font-bold text-sm text-[var(--color-text-primary)] mb-4">
          Daily Discipline Breakdown
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {weekDates.map((d) => {
            const rate = getDailyCompletionRate(state.habits, state.habitCompletions, d);
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
              new Date(d + 'T00:00:00').getDay()
            ];
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`text-center p-2.5 rounded-2xl border transition-all ${
                  isToday
                    ? 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/30'
                    : 'bg-white/[0.025] border-white/[0.05]'
                }`}
              >
                <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-1">
                  {dayName}
                </p>
                <p
                  className={`text-sm sm:text-base font-black font-mono ${
                    rate.percent >= 80
                      ? 'text-[var(--color-accent)]'
                      : rate.percent >= 50
                      ? 'text-amber-400'
                      : rate.total === 0
                      ? 'text-[var(--color-text-tertiary)]'
                      : 'text-[var(--color-text-secondary)]'
                  }`}
                >
                  {rate.total > 0 ? `${rate.percent}%` : '—'}
                </p>
                <p className="text-[10px] font-medium text-[var(--color-text-tertiary)] mt-0.5">
                  {rate.completed}/{rate.total}
                </p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Review Content */}
      {weekReview ? (
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)]">
                Logged Review
              </h3>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                Completed on {new Date(weekReview.createdAt || Date.now()).toLocaleDateString()}
              </p>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08]">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={14}
                  className={
                    s <= weekReview.rating
                      ? 'text-amber-400 fill-amber-400'
                      : 'text-white/20'
                  }
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {weekReview.wentWell && (
              <div className="p-4 rounded-2xl bg-green-500/10 border border-green-500/20">
                <p className="text-xs font-bold text-green-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <CheckCircle size={14} /> What went well?
                </p>
                <p className="text-xs sm:text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                  {weekReview.wentWell}
                </p>
              </div>
            )}

            {weekReview.difficult && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20">
                <p className="text-xs font-bold text-rose-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <AlertCircle size={14} /> What was difficult?
                </p>
                <p className="text-xs sm:text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                  {weekReview.difficult}
                </p>
              </div>
            )}

            {weekReview.changeNext && (
              <div className="p-4 rounded-2xl bg-sky-500/10 border border-sky-500/20">
                <p className="text-xs font-bold text-sky-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <ArrowRight size={14} /> Adjustments for next week
                </p>
                <p className="text-xs sm:text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                  {weekReview.changeNext}
                </p>
              </div>
            )}

            {weekReview.priority && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  <Sparkles size={14} /> Key Strategic Priority
                </p>
                <p className="text-xs sm:text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                  {weekReview.priority}
                </p>
              </div>
            )}
          </div>

          <div className="pt-2">
            <Button variant="secondary" size="sm" onClick={openNewReview}>
              Edit Retrospective
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="text-center py-10 p-5 sm:p-6">
          <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[var(--color-accent)] mx-auto mb-3">
            <MessageSquare size={24} />
          </div>
          <h3 className="font-bold text-base text-[var(--color-text-primary)] mb-1">
            No retrospective logged for this week
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] max-w-sm mx-auto mb-4 leading-relaxed">
            Take 3 minutes to evaluate what went right, what needs adjustment, and what your single priority is for next week.
          </p>
          <Button size="sm" onClick={openNewReview}>
            <Plus size={14} /> Write Weekly Review
          </Button>
        </Card>
      )}

      {/* Past Reviews List */}
      {reviews.length > 0 && (
        <Card className="p-5">
          <h3 className="font-bold text-sm text-[var(--color-text-primary)] mb-3">
            Historical Reviews Archive
          </h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {[...reviews]
              .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
              .map((r) => (
                <div
                  key={r.id}
                  onClick={() => {
                    const diff = Math.round(
                      (new Date(r.weekStart + 'T00:00:00') -
                        new Date(getWeekDates()[0] + 'T00:00:00')) /
                        (7 * 86400000)
                    );
                    setWeekOffset(diff);
                  }}
                  className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    <CalendarCheck size={18} className="text-[var(--color-accent)] shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">
                        {r.weekStart} – {r.weekEnd}
                      </p>
                      {r.priority && (
                        <p className="text-xs text-[var(--color-text-tertiary)] truncate max-w-md mt-0.5">
                          Priority: {r.priority}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={12}
                        className={
                          s <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-white/20'
                        }
                      />
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </Card>
      )}

      {/* Review Form Modal */}
      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        title="Weekly Retrospective"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4">
          <div className="text-center p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Rate Your Overall Week
            </p>
            <div className="flex justify-center gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  onClick={() => setRating(s)}
                  className="p-1 transition-transform active:scale-95"
                >
                  <Star
                    size={26}
                    className={
                      s <= rating
                        ? 'text-amber-400 fill-amber-400 drop-shadow-[0_2px_8px_rgba(245,158,11,0.4)]'
                        : 'text-white/20 hover:text-white/40'
                    }
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-green-400 mb-1 block">
              What went well? (Wins & Breakthroughs)
            </label>
            <textarea
              value={wentWell}
              onChange={(e) => setWentWell(e.target.value)}
              placeholder="What workouts, habits, or learning sessions were executed with high quality?"
              rows={3}
              className="resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-rose-400 mb-1 block">
              What was difficult? (Frictions & Traps)
            </label>
            <textarea
              value={difficult}
              onChange={(e) => setDifficult(e.target.value)}
              placeholder="Where did friction occur? Missed targets, low energy, or distraction patterns?"
              rows={3}
              className="resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-sky-400 mb-1 block">
              What should change next week? (Actionable Adjustment)
            </label>
            <textarea
              value={changeNext}
              onChange={(e) => setChangeNext(e.target.value)}
              placeholder="What systems or schedule tweaks will prevent repeating these mistakes?"
              rows={3}
              className="resize-none"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-amber-400 mb-1 block">
              What is your single #1 priority next week?
            </label>
            <textarea
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              placeholder="The main objective that makes everything else easier or obsolete..."
              rows={2}
              className="resize-none"
            />
          </div>

          <Button onClick={saveReview} className="w-full">
            Save Retrospective
          </Button>
        </div>
      </Modal>
    </div>
  );
}

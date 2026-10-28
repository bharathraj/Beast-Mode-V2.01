import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '../store/StoreContext';
import { todayStr, generateId } from '../utils/storage';
import {
  isHabitScheduledForDate,
  getStreak,
  getDailyCompletionRate,
  getWeekDates,
  getMonthlyCompletionRate,
} from '../utils/challenge';
import { Card, Button, Modal, PageHeader, EmptyState, TabBar, Badge, ProgressRing } from '../components/ui';
import {
  Plus,
  CheckCircle2,
  Circle,
  Flame,
  Calendar,
  MoreVertical,
  Edit3,
  Trash2,
  Archive,
  ListChecks,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Target,
  Check,
} from 'lucide-react';

const CATEGORIES = ['all', 'discipline', 'body', 'mind', 'learning', 'nutrition', 'money'];
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

export default function HabitsPage() {
  const { state, dispatch } = useStore();
  const today = todayStr();
  const [tab, setTab] = useState('today');
  const [category, setCategory] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editingHabit, setEditingHabit] = useState(null);
  const [menuOpen, setMenuOpen] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formCat, setFormCat] = useState('discipline');
  const [formIcon, setFormIcon] = useState('📌');
  const [formSchedule, setFormSchedule] = useState('daily');
  const [formDays, setFormDays] = useState([]);
  const [formTarget, setFormTarget] = useState('');

  const habits = useMemo(() => {
    let list = state.habits.filter((h) => !h.archived);
    if (category !== 'all') list = list.filter((h) => h.category === category);
    if (tab === 'today') list = list.filter((h) => isHabitScheduledForDate(h, today));
    return list;
  }, [state.habits, category, tab, today]);

  const dailyRate = useMemo(
    () => getDailyCompletionRate(state.habits, state.habitCompletions, today),
    [state.habits, state.habitCompletions, today]
  );

  const monthRate = useMemo(
    () => getMonthlyCompletionRate(state.habits, state.habitCompletions, today.slice(0, 7)),
    [state.habits, state.habitCompletions, today]
  );

  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const weekLabel = useMemo(() => {
    const start = new Date(weekDates[0] + 'T00:00:00');
    const end = new Date(weekDates[6] + 'T00:00:00');
    const fmt = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${fmt(start)} – ${fmt(end)}`;
  }, [weekDates]);

  function isCompleted(habitId, date) {
    return state.habitCompletions.some(
      (c) => c.habitId === habitId && c.date === (date || today)
    );
  }

  function toggleHabit(habitId) {
    dispatch({ type: 'TOGGLE_HABIT_COMPLETION', payload: { habitId, date: today } });
  }

  function resetForm() {
    setFormName('');
    setFormDesc('');
    setFormCat('discipline');
    setFormIcon('📌');
    setFormSchedule('daily');
    setFormDays([]);
    setFormTarget('');
  }

  function openEdit(habit) {
    setEditingHabit(habit);
    setFormName(habit.name);
    setFormDesc(habit.description || '');
    setFormCat(habit.category);
    setFormIcon(habit.icon || '📌');
    setFormTarget(habit.target || '');
    setFormSchedule(Array.isArray(habit.schedule) ? 'custom' : habit.schedule || 'daily');
    setFormDays(Array.isArray(habit.schedule) ? habit.schedule : []);
    setShowCreate(true);
    setMenuOpen(null);
  }

  function saveHabit() {
    if (!formName.trim()) return;
    const schedule = formSchedule === 'custom' ? formDays : formSchedule;
    if (editingHabit) {
      dispatch({
        type: 'UPDATE_HABIT',
        payload: {
          id: editingHabit.id,
          name: formName.trim(),
          description: formDesc.trim(),
          category: formCat,
          icon: formIcon,
          schedule,
          target: formTarget.trim() || null,
        },
      });
    } else {
      dispatch({
        type: 'ADD_HABIT',
        payload: {
          id: generateId(),
          name: formName.trim(),
          description: formDesc.trim(),
          category: formCat,
          icon: formIcon,
          schedule,
          target: formTarget.trim() || null,
          color: null,
          archived: false,
          createdAt: new Date().toISOString(),
        },
      });
    }
    setShowCreate(false);
    setEditingHabit(null);
    resetForm();
  }

  function deleteHabit(id) {
    dispatch({ type: 'DELETE_HABIT', payload: id });
    setMenuOpen(null);
  }

  function archiveHabit(id) {
    dispatch({ type: 'UPDATE_HABIT', payload: { id, archived: true } });
    setMenuOpen(null);
  }

  const icons = [
    '📌', '⏰', '📵', '🚿', '🛏️', '🚫', '💪', '🚶', '🧘', '💧',
    '🧠', '📝', '🙏', '😊', '📖', '🎓', '⚡', '🍽️', '🥦', '🧑‍🍳',
    '💰', '🛒', '🏦', '🔥', '⭐', '🎯', '🏃', '🎵', '💤', '🧹',
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Habit Protocols"
        subtitle={`${dailyRate.completed} of ${dailyRate.total} daily habits logged today`}
        action={
          <Button
            onClick={() => {
              resetForm();
              setEditingHabit(null);
              setShowCreate(true);
            }}
            size="sm"
          >
            <Plus size={16} /> New Habit
          </Button>
        }
      />

      <TabBar
        tabs={[
          { key: 'today', label: 'Today' },
          { key: 'all', label: 'All Habits' },
          { key: 'history', label: 'Weekly Matrix' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab !== 'history' && (
        <div className="flex gap-2 overflow-x-auto pb-1 text-xs font-semibold">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={`px-3.5 py-1.5 rounded-xl whitespace-nowrap capitalize transition-all ${
                category === c
                  ? 'bg-[var(--color-accent)] text-black font-black shadow-[0_2px_8px_rgba(132,204,22,0.3)]'
                  : 'bg-white/[0.04] border border-white/[0.06] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.08]'
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {tab === 'history' ? (
        <div className="space-y-5">
          {/* Monthly Completion Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <Card className="flex items-center gap-4 p-5">
              <ProgressRing percent={monthRate.percent} size={64} strokeWidth={6}>
                <span className="text-xs font-black text-[var(--color-text-primary)]">
                  {monthRate.percent}%
                </span>
              </ProgressRing>
              <div>
                <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase font-bold tracking-wider">
                  Monthly Consistency
                </p>
                <p className="text-base font-extrabold text-[var(--color-text-primary)] mt-0.5">
                  {monthRate.completed} of {monthRate.total} completed
                </p>
                <p className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                  {new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' })}
                </p>
              </div>
            </Card>

            <Card className="flex items-center gap-4 p-5">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/15 border border-orange-500/25 flex items-center justify-center text-orange-400 shrink-0">
                <Flame size={24} />
              </div>
              <div>
                <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase font-bold tracking-wider">
                  Streaks in Motion
                </p>
                <p className="text-base font-extrabold text-[var(--color-text-primary)] mt-0.5">
                  {
                    state.habits.filter(
                      (h) => !h.archived && getStreak(h.id, state.habitCompletions).current > 0
                    ).length
                  }{' '}
                  habits maintaining active streaks
                </p>
                <p className="text-[11px] text-[var(--color-accent)] font-semibold mt-0.5">
                  Small daily wins compound exponentially
                </p>
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-5 pb-3 border-b border-white/[0.08]">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <p className="font-extrabold text-sm text-[var(--color-text-primary)]">{weekLabel}</p>
                <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mt-0.5">
                  {weekOffset === 0
                    ? 'Current Week'
                    : `${Math.abs(weekOffset)} week${Math.abs(weekOffset) > 1 ? 's' : ''} ago`}
                </p>
              </div>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                disabled={weekOffset >= 0}
                className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] disabled:opacity-20 transition-colors"
              >
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left py-2 pr-4 text-xs text-[var(--color-text-tertiary)] font-bold uppercase tracking-wider">
                      Habit
                    </th>
                    {weekDates.map((d) => (
                      <th
                        key={d}
                        className="text-center py-2 px-1 text-xs text-[var(--color-text-tertiary)] font-bold"
                      >
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T00:00:00').getDay()]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {state.habits
                    .filter((h) => !h.archived)
                    .map((h) => (
                      <tr key={h.id} className="hover:bg-white/[0.02] transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2.5">
                            <span className="text-base">{h.icon || '📌'}</span>
                            <div className="min-w-0">
                              <span className="font-bold text-xs sm:text-sm text-[var(--color-text-primary)] truncate max-w-[140px] block">
                                {h.name}
                              </span>
                              {h.target && (
                                <span className="text-[10px] text-[var(--color-text-tertiary)] block mt-0.5">
                                  {h.target}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        {weekDates.map((d) => {
                          const scheduled = isHabitScheduledForDate(h, d);
                          const done = isCompleted(h.id, d);
                          return (
                            <td key={d} className="text-center py-3 px-1">
                              {scheduled ? (
                                done ? (
                                  <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] mx-auto flex items-center justify-center text-black">
                                    <Check size={13} strokeWidth={3} />
                                  </div>
                                ) : (
                                  <div className="w-6 h-6 rounded-full border border-white/20 mx-auto" />
                                )
                              ) : (
                                <span className="text-xs text-[var(--color-text-tertiary)]">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : habits.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={tab === 'today' ? 'No habits for today' : 'No habits created yet'}
          description={
            tab === 'today'
              ? 'Enjoy your rest day or add a custom habit to your schedule.'
              : 'Start constructing your 90-day transformation routine by adding your first daily habit.'
          }
          action={
            <Button
              onClick={() => {
                resetForm();
                setShowCreate(true);
              }}
              size="sm"
            >
              <Plus size={16} /> Create Habit
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {habits.map((habit) => {
            const done = isCompleted(habit.id);
            const streak = getStreak(habit.id, state.habitCompletions);
            return (
              <motion.div
                key={habit.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card
                  className={`flex items-center gap-3.5 p-3.5 sm:p-4 transition-all ${
                    done ? 'bg-[var(--color-accent-dim)]/40 border-[var(--color-accent)]/30' : ''
                  }`}
                >
                  <button
                    onClick={() => toggleHabit(habit.id)}
                    className="shrink-0 transition-transform active:scale-90"
                  >
                    {done ? (
                      <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-black shadow-[0_0_10px_rgba(132,204,22,0.4)]">
                        <Check size={14} strokeWidth={3} />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-white/30 hover:border-white/60 transition-colors" />
                    )}
                  </button>

                  <span className="text-xl leading-none">{habit.icon || '📌'}</span>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`font-bold text-sm text-[var(--color-text-primary)] truncate ${
                        done ? 'line-through opacity-65 text-[var(--color-text-tertiary)]' : ''
                      }`}
                    >
                      {habit.name}
                    </p>
                    {habit.description && (
                      <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                        {habit.description}
                      </p>
                    )}
                  </div>

                  {streak.current > 0 && (
                    <div className="flex items-center gap-1 text-[11px] font-bold text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full shrink-0">
                      <Flame size={12} />
                      {streak.current}d
                    </div>
                  )}

                  <Badge color={`var(--color-${habit.category})`} className="capitalize shrink-0">
                    {habit.category}
                  </Badge>

                  <div className="relative shrink-0">
                    <button
                      onClick={() => setMenuOpen(menuOpen === habit.id ? null : habit.id)}
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] transition-colors"
                    >
                      <MoreVertical size={16} />
                    </button>

                    {menuOpen === habit.id && (
                      <div className="absolute right-0 top-9 z-50 bg-[#16161b]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-[0_16px_36px_rgba(0,0,0,0.6)] py-1.5 w-36">
                        <button
                          onClick={() => openEdit(habit)}
                          className="flex items-center gap-2 w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-white/[0.08] transition-colors"
                        >
                          <Edit3 size={14} /> Edit
                        </button>
                        <button
                          onClick={() => archiveHabit(habit.id)}
                          className="flex items-center gap-2 w-full px-3.5 py-2 text-xs font-semibold text-[var(--color-text-primary)] hover:bg-white/[0.08] transition-colors"
                        >
                          <Archive size={14} /> Archive
                        </button>
                        <button
                          onClick={() => deleteHabit(habit.id)}
                          className="flex items-center gap-2 w-full px-3.5 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => {
          setShowCreate(false);
          setEditingHabit(null);
          resetForm();
        }}
        title={editingHabit ? 'Edit Habit Protocol' : 'New Habit Protocol'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Habit Name
            </label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g., Cold Shower, Read 10 Pages, Mobility Routine"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Description (optional)
            </label>
            <input
              value={formDesc}
              onChange={(e) => setFormDesc(e.target.value)}
              placeholder="Why this habit matters for your transformation"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Category Pillar
            </label>
            <select value={formCat} onChange={(e) => setFormCat(e.target.value)}>
              {CATEGORIES.filter((c) => c !== 'all').map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Emoji Icon
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              {icons.map((ic) => (
                <button
                  key={ic}
                  onClick={() => setFormIcon(ic)}
                  className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition-all ${
                    formIcon === ic
                      ? 'bg-[var(--color-accent)] ring-2 ring-[var(--color-accent)] text-black'
                      : 'bg-white/[0.04] hover:bg-white/[0.08]'
                  }`}
                >
                  {ic}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Measurable Target (optional)
            </label>
            <input
              value={formTarget}
              onChange={(e) => setFormTarget(e.target.value)}
              placeholder="e.g., 30 mins, 5 km, 8 glasses"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Schedule Frequency
            </label>
            <select value={formSchedule} onChange={(e) => setFormSchedule(e.target.value)}>
              <option value="daily">Every day</option>
              <option value="custom">Specific days</option>
            </select>
          </div>
          {formSchedule === 'custom' && (
            <div className="flex gap-1.5">
              {DAYS.map((d) => (
                <button
                  key={d}
                  onClick={() =>
                    setFormDays((prev) =>
                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                    )
                  }
                  className={`flex-1 py-2 rounded-xl text-xs font-bold capitalize transition-all ${
                    formDays.includes(d)
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'bg-white/[0.04] text-[var(--color-text-secondary)] hover:bg-white/[0.08]'
                  }`}
                >
                  {d.slice(0, 3)}
                </button>
              ))}
            </div>
          )}
          <Button onClick={saveHabit} disabled={!formName.trim()} className="w-full">
            {editingHabit ? 'Save Protocol Changes' : 'Create Habit Protocol'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

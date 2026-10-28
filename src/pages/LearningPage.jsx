import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/StoreContext';
import { generateId, todayStr } from '../utils/storage';
import { Card, Button, Modal, PageHeader, EmptyState, TabBar, Badge, ProgressRing } from '../components/ui';
import {
  Plus,
  BookOpen,
  Clock,
  Target,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Edit3,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export default function LearningPage() {
  const { state, dispatch } = useStore();
  const today = todayStr();
  const [tab, setTab] = useState('goals');
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);

  // Goal form
  const [goalName, setGoalName] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalTarget, setGoalTarget] = useState('60'); // minutes per week
  const [goalColor, setGoalColor] = useState('#f59e0b');

  // Log form
  const [logGoalId, setLogGoalId] = useState('');
  const [logDuration, setLogDuration] = useState('');
  const [logNotes, setLogNotes] = useState('');

  // Study timer
  const [timerGoalId, setTimerGoalId] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const timerRef = useRef(null);

  const goals = state.learningGoals || [];
  const sessions = state.learningSessions || [];

  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [timerRunning]);

  const weeklyTimeByGoal = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStr = weekAgo.toISOString().slice(0, 10);
    const map = {};
    sessions.forEach((s) => {
      if (s.date >= weekStr) {
        map[s.goalId] = (map[s.goalId] || 0) + (s.duration || 0);
      }
    });
    return map;
  }, [sessions]);

  const totalTimeToday = useMemo(() => {
    return sessions
      .filter((s) => s.date === today)
      .reduce((sum, s) => sum + (s.duration || 0), 0);
  }, [sessions, today]);

  function resetGoalForm() {
    setGoalName('');
    setGoalDesc('');
    setGoalTarget('60');
    setGoalColor('#f59e0b');
    setEditingGoal(null);
  }

  function saveGoal() {
    if (!goalName.trim()) return;
    if (editingGoal) {
      dispatch({
        type: 'UPDATE_LEARNING_GOAL',
        payload: {
          id: editingGoal.id,
          name: goalName.trim(),
          description: goalDesc.trim(),
          weeklyTarget: parseInt(goalTarget, 10) || 60,
          color: goalColor,
        },
      });
    } else {
      dispatch({
        type: 'ADD_LEARNING_GOAL',
        payload: {
          id: generateId(),
          name: goalName.trim(),
          description: goalDesc.trim(),
          weeklyTarget: parseInt(goalTarget, 10) || 60,
          color: goalColor,
          status: 'active',
          createdAt: new Date().toISOString(),
        },
      });
    }
    setShowGoalForm(false);
    resetGoalForm();
  }

  function openEditGoal(goal) {
    setEditingGoal(goal);
    setGoalName(goal.name);
    setGoalDesc(goal.description || '');
    setGoalTarget(String(goal.weeklyTarget || 60));
    setGoalColor(goal.color || '#f59e0b');
    setShowGoalForm(true);
  }

  function deleteGoal(id) {
    dispatch({ type: 'DELETE_LEARNING_GOAL', payload: id });
  }

  function logSession() {
    if (!logGoalId || !logDuration) return;
    dispatch({
      type: 'ADD_LEARNING_SESSION',
      payload: {
        id: generateId(),
        goalId: logGoalId,
        date: today,
        duration: parseInt(logDuration, 10),
        notes: logNotes.trim(),
        createdAt: new Date().toISOString(),
      },
    });
    setLogGoalId('');
    setLogDuration('');
    setLogNotes('');
    setShowLogForm(false);
  }

  function stopTimer() {
    setTimerRunning(false);
    clearInterval(timerRef.current);
    if (timerSeconds > 0 && timerGoalId) {
      const mins = Math.round(timerSeconds / 60);
      if (mins > 0) {
        dispatch({
          type: 'ADD_LEARNING_SESSION',
          payload: {
            id: generateId(),
            goalId: timerGoalId,
            date: today,
            duration: mins,
            notes: 'Timed focus session',
            createdAt: new Date().toISOString(),
          },
        });
      }
    }
    setTimerSeconds(0);
    setTimerGoalId('');
  }

  function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  const colors = [
    '#f59e0b',
    '#ef4444',
    '#3b82f6',
    '#22c55e',
    '#a855f7',
    '#06b6d4',
    '#ec4899',
    '#84cc16',
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Knowledge & Deep Work"
        subtitle={`${totalTimeToday} min of deliberate learning logged today`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowLogForm(true)}>
              <Clock size={14} /> Quick Log
            </Button>
            <Button
              size="sm"
              onClick={() => {
                resetGoalForm();
                setShowGoalForm(true);
              }}
            >
              <Plus size={14} /> New Goal
            </Button>
          </div>
        }
      />

      <TabBar
        tabs={[
          { key: 'goals', label: 'Skill Goals' },
          { key: 'timer', label: 'Focus Timer' },
          { key: 'history', label: 'Session History' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'goals' && (
        <div className="space-y-4">
          {goals.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No learning goals established"
              description="Define high-leverage skills, books, or technical domains to pursue consistently during your 90 days."
              action={
                <Button
                  size="sm"
                  onClick={() => {
                    resetGoalForm();
                    setShowGoalForm(true);
                  }}
                >
                  <Plus size={14} /> Create Skill Goal
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {goals
                .filter((g) => g.status === 'active')
                .map((goal) => {
                  const weekMin = weeklyTimeByGoal[goal.id] || 0;
                  const pct = goal.weeklyTarget
                    ? Math.min(100, Math.round((weekMin / goal.weeklyTarget) * 100))
                    : 0;
                  return (
                    <Card
                      key={goal.id}
                      className="flex items-center gap-4 p-4 sm:p-5 hover:border-white/[0.18] transition-all"
                    >
                      <ProgressRing
                        percent={pct}
                        size={58}
                        strokeWidth={5}
                        color={goal.color || 'var(--color-learning)'}
                      >
                        <span className="text-xs font-black text-[var(--color-text-primary)]">
                          {pct}%
                        </span>
                      </ProgressRing>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm sm:text-base text-[var(--color-text-primary)] truncate">
                          {goal.name}
                        </p>
                        {goal.description && (
                          <p className="text-xs text-[var(--color-text-tertiary)] truncate mt-0.5">
                            {goal.description}
                          </p>
                        )}
                        <p className="text-xs font-semibold text-[var(--color-text-secondary)] mt-1">
                          {weekMin} / {goal.weeklyTarget} min this week
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => openEditGoal(goal)}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] transition-colors"
                        >
                          <Edit3 size={15} />
                        </button>
                        <button
                          onClick={() => deleteGoal(goal.id)}
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {tab === 'timer' && (
        <Card className="text-center py-10 p-5 sm:p-8">
          <div className="w-16 h-16 rounded-3xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400 mx-auto mb-4 shadow-[0_0_24px_rgba(245,158,11,0.25)]">
            <BookOpen size={30} />
          </div>

          <h3 className="font-extrabold text-lg text-[var(--color-text-primary)] mb-1">
            Deep Work Timer
          </h3>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-5">
            Maintain unbroken cognitive flow without digital distractions
          </p>

          {!timerRunning && timerSeconds === 0 && goals.length > 0 && (
            <div className="mb-6 max-w-xs mx-auto text-left">
              <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1.5 block">
                Target Skill Domain
              </label>
              <select
                value={timerGoalId}
                onChange={(e) => setTimerGoalId(e.target.value)}
                className="w-full text-xs"
              >
                <option value="">Select a goal to attach time...</option>
                {goals
                  .filter((g) => g.status === 'active')
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <p className="text-6xl font-black font-mono tracking-tight text-[var(--color-text-primary)] mb-7">
            {formatTime(timerSeconds)}
          </p>

          <div className="flex justify-center gap-3">
            {!timerRunning ? (
              <Button
                onClick={() => setTimerRunning(true)}
                disabled={!timerGoalId && goals.length > 0}
                size="lg"
              >
                <Play size={18} className="fill-current" /> {timerSeconds > 0 ? 'Resume Timer' : 'Start Focus Block'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setTimerRunning(false);
                  clearInterval(timerRef.current);
                }}
                size="lg"
              >
                <Pause size={18} /> Pause
              </Button>
            )}
            {timerSeconds > 0 && (
              <>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTimerRunning(false);
                    clearInterval(timerRef.current);
                    setTimerSeconds(0);
                  }}
                  size="lg"
                >
                  <RotateCcw size={18} /> Reset
                </Button>
                <Button onClick={stopTimer} size="lg">
                  Save Session
                </Button>
              </>
            )}
          </div>

          {goals.length === 0 && (
            <p className="text-xs text-[var(--color-text-tertiary)] mt-6">
              Create a learning goal first to log focused time against it.
            </p>
          )}
        </Card>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No study sessions on record"
              description="Log study sessions manually or execute deep work blocks using the timer."
            />
          ) : (
            <div className="space-y-2.5">
              {[...sessions]
                .sort(
                  (a, b) =>
                    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)
                )
                .slice(0, 50)
                .map((s) => {
                  const goal = goals.find((g) => g.id === s.goalId);
                  return (
                    <Card
                      key={s.id}
                      className="flex items-center gap-3.5 p-3.5 sm:p-4 hover:border-white/[0.16] transition-all"
                    >
                      <div
                        className="w-2.5 h-9 rounded-full shrink-0"
                        style={{ background: goal?.color || 'var(--color-learning)' }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                          {goal?.name || 'Self-Directed Study'}
                        </p>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                          {s.date}
                          {s.notes ? ` · ${s.notes}` : ''}
                        </p>
                      </div>
                      <Badge color={goal?.color || 'var(--color-learning)'} className="shrink-0">
                        {s.duration} min
                      </Badge>
                    </Card>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Goal Form Modal */}
      <Modal
        isOpen={showGoalForm}
        onClose={() => {
          setShowGoalForm(false);
          resetGoalForm();
        }}
        title={editingGoal ? 'Edit Learning Goal' : 'New Learning Goal'}
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Skill / Topic Domain
            </label>
            <input
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="e.g., System Architecture, Spanish, Piano, Machine Learning"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Description (optional)
            </label>
            <input
              value={goalDesc}
              onChange={(e) => setGoalDesc(e.target.value)}
              placeholder="Target outcomes and milestone criteria"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Weekly Target (minutes)
            </label>
            <input
              type="number"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              placeholder="60"
              className="font-mono font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1.5 block">
              Color Accent
            </label>
            <div className="flex gap-2">
              {colors.map((c) => (
                <button
                  key={c}
                  onClick={() => setGoalColor(c)}
                  className={`w-8 h-8 rounded-xl transition-all ${
                    goalColor === c
                      ? 'ring-2 ring-white scale-110 shadow-[0_2px_8px_rgba(0,0,0,0.5)]'
                      : 'opacity-75 hover:opacity-100'
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <Button onClick={saveGoal} disabled={!goalName.trim()} className="w-full">
            {editingGoal ? 'Save Goal Changes' : 'Establish Learning Goal'}
          </Button>
        </div>
      </Modal>

      {/* Log Session Modal */}
      <Modal
        isOpen={showLogForm}
        onClose={() => setShowLogForm(false)}
        title="Log Focus Session"
      >
        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Target Goal
            </label>
            <select value={logGoalId} onChange={(e) => setLogGoalId(e.target.value)}>
              <option value="">Select a goal...</option>
              {goals
                .filter((g) => g.status === 'active')
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Duration (minutes)
            </label>
            <input
              type="number"
              value={logDuration}
              onChange={(e) => setLogDuration(e.target.value)}
              placeholder="e.g., 45"
              className="font-mono font-bold"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Session Notes (optional)
            </label>
            <textarea
              value={logNotes}
              onChange={(e) => setLogNotes(e.target.value)}
              placeholder="What concepts, chapters, or practice problems did you complete?"
              rows={3}
              className="resize-none"
            />
          </div>
          <Button onClick={logSession} disabled={!logGoalId || !logDuration} className="w-full">
            Log Session
          </Button>
        </div>
      </Modal>
    </div>
  );
}

import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/StoreContext';
import { generateId, todayStr } from '../utils/storage';
import { defaultWorkoutTemplates } from '../data/defaults';
import { Card, Button, Modal, PageHeader, EmptyState, TabBar, Badge } from '../components/ui';
import {
  fetchWgerExercises,
  fallbackToLocalExercises,
  WGER_CATEGORIES,
  WGER_EQUIPMENT,
  WGER_MUSCLES,
} from '../services/wgerApi';
import {
  Plus, Dumbbell, Play, Square, Clock, Search,
  ChevronRight, Trash2, Trophy, Weight, Timer,
  TrendingUp, RefreshCw, ExternalLink, Info, Filter,
  ChevronLeft, Image as ImageIcon, Check, Sparkles,
  RotateCcw, Activity, Minimize2, Edit3, BookmarkPlus
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function ExerciseThumbnail({ src, alt, size = 'md' }) {
  const [imgError, setImgError] = useState(false);
  const sizeClasses = size === 'sm' ? 'w-9 h-9' : 'w-12 h-12';
  const iconSize = size === 'sm' ? 15 : 20;

  if (!src || imgError) {
    return (
      <div
        className={`${sizeClasses} rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] flex items-center justify-center shrink-0 text-[var(--color-accent)]`}
        aria-label="Exercise icon"
      >
        <Dumbbell size={iconSize} strokeWidth={1.8} />
      </div>
    );
  }

  return (
    <div
      className={`${sizeClasses} rounded-2xl overflow-hidden bg-black/50 border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] shrink-0 flex items-center justify-center`}
    >
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onError={() => setImgError(true)}
        className="w-full h-full object-cover transition-transform duration-300 hover:scale-110"
      />
    </div>
  );
}

export const ACTIVE_WORKOUT_KEY = 'bm90_active_workout';

export function loadSavedWorkoutSession() {
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : (typeof window !== 'undefined' ? window.localStorage : null);
    if (!storage) return null;
    const raw = storage.getItem(ACTIVE_WORKOUT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.exercises) &&
      parsed.status === 'active'
    ) {
      return parsed;
    }
  } catch (err) {
    console.error('Failed to load active workout session:', err);
  }
  return null;
}

export function saveActiveWorkoutSession(session) {
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : (typeof window !== 'undefined' ? window.localStorage : null);
    if (!storage) return;
    if (session) {
      storage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(session));
    } else {
      storage.removeItem(ACTIVE_WORKOUT_KEY);
    }
  } catch (err) {
    console.error('Failed to save active workout session:', err);
  }
}

export const DEFAULT_TEMPLATE_IDS = ['wt_push', 'wt_pull', 'wt_legs', 'wt_full_body'];

export default function TrainPage() {
  const { state, dispatch } = useStore();
  const [tab, setTab] = useState('workout');
  const [showStart, setShowStart] = useState(false);
  const [activeSession, setActiveSession] = useState(() => loadSavedWorkoutSession());
  const [isWorkoutMinimized, setIsWorkoutMinimized] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [pendingTemplateToStart, setPendingTemplateToStart] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);

  // Routine management state
  const [showRoutineModal, setShowRoutineModal] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState(null);
  const [routineName, setRoutineName] = useState('');
  const [routineDescription, setRoutineDescription] = useState('');
  const [routineExercises, setRoutineExercises] = useState([]);
  const [showRoutineExPicker, setShowRoutineExPicker] = useState(false);
  const [routineToDelete, setRoutineToDelete] = useState(null);
  const [showDeleteRoutineConfirm, setShowDeleteRoutineConfirm] = useState(false);

  // Exercise library & wger state
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedMuscle, setSelectedMuscle] = useState('');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [wgerData, setWgerData] = useState({ exercises: [], totalPages: 1, total: 0, isFallback: false });
  const [loadingWger, setLoadingWger] = useState(false);
  const [wgerError, setWgerError] = useState(null);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [selectedExerciseDetail, setSelectedExerciseDetail] = useState(null);
  const [detailImgError, setDetailImgError] = useState(false);
  const [showExerciseLib, setShowExerciseLib] = useState(false);

  // Custom exercise creation
  const [showCustomExModal, setShowCustomExModal] = useState(false);
  const [customExName, setCustomExName] = useState('');
  const [customExCategory, setCustomExCategory] = useState('chest');
  const [customExEquipment, setCustomExEquipment] = useState('barbell');
  const [customExMuscles, setCustomExMuscles] = useState('');
  const [customExInstructions, setCustomExInstructions] = useState('');

  // Body measurements
  const [showBodyForm, setShowBodyForm] = useState(false);
  const [editingMeasurement, setEditingMeasurement] = useState(null);
  const [bodyDate, setBodyDate] = useState(todayStr());
  const [bodyWeight, setBodyWeight] = useState('');
  const [bodyWaist, setBodyWaist] = useState('');

  // Rest timer
  const [restTimer, setRestTimer] = useState(0);
  const [restRunning, setRestRunning] = useState(false);
  const [restAlert, setRestAlert] = useState(false);
  const timerRef = useRef(null);

  const localExercises = state.exercises || [];

  const allTemplates = useMemo(() => {
    const saved = state.workoutTemplates || [];
    const defaults = defaultWorkoutTemplates.filter(dt => !saved.find(s => s.id === dt.id));
    return [...saved, ...defaults];
  }, [state.workoutTemplates]);

  // Reset detail image error when active modal item changes
  useEffect(() => {
    setDetailImgError(false);
  }, [selectedExerciseDetail]);

  // Synchronize active workout session state to localStorage key
  useEffect(() => {
    saveActiveWorkoutSession(activeSession);
  }, [activeSession]);

  // Fetch from wger API whenever search, category, muscle, equipment, page, or retry trigger changes
  useEffect(() => {
    let isCancelled = false;
    setLoadingWger(true);
    setWgerError(null);

    const timer = setTimeout(async () => {
      try {
        const res = await fetchWgerExercises({
          search: exerciseSearch,
          category: selectedCategory,
          muscle: selectedMuscle,
          equipment: selectedEquipment,
          page: currentPage,
          limit: 16,
        });

        if (!isCancelled) {
          setWgerData(res);
          setLoadingWger(false);
          setWgerError(null);
        }
      } catch (err) {
        if (!isCancelled) {
          setLoadingWger(false);
          setWgerError(err.message || 'Failed to fetch exercises from wger.de API.');
          setWgerData(prev => ({ ...prev, exercises: [] }));
        }
      }
    }, 300); // 300ms debounce

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [exerciseSearch, selectedCategory, selectedMuscle, selectedEquipment, currentPage, retryTrigger]);

  const sessions = useMemo(() =>
    [...(state.workoutSessions || [])].sort((a, b) => new Date(b.date) - new Date(a.date)),
    [state.workoutSessions]
  );

  const personalRecords = useMemo(() => {
    const prs = {};
    (state.workoutSessions || []).forEach(session => {
      (session.exercises || []).forEach(ex => {
        (ex.sets || []).forEach(set => {
          if (set.completed && set.weight) {
            const w = parseFloat(set.weight);
            if (!prs[ex.exerciseId] || w > prs[ex.exerciseId].weight) {
              prs[ex.exerciseId] = { weight: w, reps: set.reps, date: session.date };
            }
          }
        });
      });
    });
    return prs;
  }, [state.workoutSessions]);

  const volumeTrend = useMemo(() => {
    return [...(state.workoutSessions || [])]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-10)
      .map(s => ({
        date: s.date.slice(5),
        name: s.name,
        volume: getSessionVolume(s),
      }));
  }, [state.workoutSessions]);

  function triggerRestCompletionAlert() {
    setRestAlert(true);
    try {
      if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch {
      // AudioContext policy
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {
      // ignore
    }

    setTimeout(() => setRestAlert(false), 4000);
  }

  // Rest timer ticker
  useEffect(() => {
    if (restRunning && restTimer > 0) {
      timerRef.current = setInterval(() => {
        setRestTimer(t => {
          if (t <= 1) {
            setRestRunning(false);
            triggerRestCompletionAlert();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [restRunning, restTimer]);

  function startWorkout(template) {
    if (activeSession) {
      setPendingTemplateToStart(template || { name: 'Quick Workout' });
      return;
    }
    initNewWorkoutSession(template);
  }

  function initNewWorkoutSession(template) {
    const session = {
      id: generateId(),
      templateId: template?.id || null,
      name: template?.name || 'Quick Workout',
      date: todayStr(),
      startTime: new Date().toISOString(),
      endTime: null,
      exercises: (template?.exercises || []).map(te => ({
        exerciseId: te.exerciseId,
        exerciseName: getExerciseName(te.exerciseId),
        sets: Array.from({ length: te.sets || 3 }, () => ({ weight: '', reps: te.reps || '', completed: false })),
      })),
      notes: '',
      status: 'active',
    };
    saveActiveWorkoutSession(session);
    setActiveSession(session);
    setIsWorkoutMinimized(false);
    setShowStart(false);
    setPendingTemplateToStart(null);
  }

  function addExerciseToSession(ex) {
    setActiveSession(prev => ({
      ...prev,
      exercises: [
        ...prev.exercises,
        {
          exerciseId: ex.id,
          exerciseName: ex.name,
          sets: [{ weight: '', reps: '', completed: false }],
        },
      ],
    }));
    setShowExerciseLib(false);
  }

  function updateSet(exIdx, setIdx, field, value) {
    setActiveSession(prev => {
      const exercises = [...prev.exercises];
      exercises[exIdx] = { ...exercises[exIdx], sets: [...exercises[exIdx].sets] };
      exercises[exIdx].sets[setIdx] = { ...exercises[exIdx].sets[setIdx], [field]: value };
      return { ...prev, exercises };
    });
  }

  function toggleSetComplete(exIdx, setIdx) {
    setActiveSession(prev => {
      const exercises = [...prev.exercises];
      exercises[exIdx] = { ...exercises[exIdx], sets: [...exercises[exIdx].sets] };
      exercises[exIdx].sets[setIdx] = { ...exercises[exIdx].sets[setIdx], completed: !exercises[exIdx].sets[setIdx].completed };
      return { ...prev, exercises };
    });
  }

  function addSet(exIdx) {
    setActiveSession(prev => {
      const exercises = [...prev.exercises];
      exercises[exIdx] = { ...exercises[exIdx], sets: [...exercises[exIdx].sets, { weight: '', reps: '', completed: false }] };
      return { ...prev, exercises };
    });
  }

  function removeExFromSession(exIdx) {
    setActiveSession(prev => ({
      ...prev,
      exercises: prev.exercises.filter((_, i) => i !== exIdx),
    }));
  }

  function finishWorkout() {
    if (!activeSession) return;
    const completed = {
      ...activeSession,
      endTime: new Date().toISOString(),
      status: 'completed',
    };
    dispatch({ type: 'ADD_WORKOUT_SESSION', payload: completed });
    saveActiveWorkoutSession(null);
    setActiveSession(null);
    setIsWorkoutMinimized(false);
  }

  function discardWorkout() {
    setShowDiscardConfirm(true);
  }

  function confirmDiscardWorkout() {
    saveActiveWorkoutSession(null);
    setActiveSession(null);
    setShowDiscardConfirm(false);
    setIsWorkoutMinimized(false);
    setPendingTemplateToStart(null);
  }

  // --- Routine & Template Management Handlers ---
  function openCreateRoutine() {
    setEditingRoutineId(null);
    setRoutineName('');
    setRoutineDescription('');
    setRoutineExercises([]);
    setShowRoutineModal(true);
  }

  function openEditRoutine(template) {
    setEditingRoutineId(template.id);
    setRoutineName(template.name || '');
    setRoutineDescription(template.description || '');
    setRoutineExercises(
      (template.exercises || []).map(te => ({
        exerciseId: te.exerciseId,
        exerciseName: te.exerciseName || getExerciseName(te.exerciseId),
        sets: te.sets || 3,
        reps: te.reps || 10,
      }))
    );
    setShowRoutineModal(true);
  }

  function addExerciseToRoutine(ex) {
    setRoutineExercises(prev => [
      ...prev,
      {
        exerciseId: ex.id,
        exerciseName: ex.name,
        sets: 3,
        reps: 10,
      },
    ]);
    setShowRoutineExPicker(false);
  }

  function removeExerciseFromRoutine(idx) {
    setRoutineExercises(prev => prev.filter((_, i) => i !== idx));
  }

  function updateRoutineExercise(idx, field, value) {
    setRoutineExercises(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  }

  function handleSaveRoutine() {
    if (!routineName.trim() || routineExercises.length === 0) return;
    const routineId = editingRoutineId || `routine_${generateId()}`;
    const payload = {
      id: routineId,
      name: routineName.trim(),
      description: routineDescription.trim(),
      exercises: routineExercises.map(re => ({
        exerciseId: re.exerciseId,
        exerciseName: re.exerciseName || getExerciseName(re.exerciseId),
        sets: Math.max(1, parseInt(re.sets, 10) || 3),
        reps: typeof re.reps === 'string' ? (parseInt(re.reps, 10) || re.reps || 10) : (re.reps || 10),
      })),
      isCustom: !DEFAULT_TEMPLATE_IDS.includes(routineId),
      updatedAt: new Date().toISOString(),
    };

    const alreadyInStore = (state.workoutTemplates || []).some(t => t.id === routineId);
    if (alreadyInStore) {
      dispatch({ type: 'UPDATE_WORKOUT_TEMPLATE', payload });
    } else {
      dispatch({ type: 'ADD_WORKOUT_TEMPLATE', payload });
    }
    setShowRoutineModal(false);
  }

  function confirmDeleteRoutine() {
    if (!routineToDelete) return;
    if (DEFAULT_TEMPLATE_IDS.includes(routineToDelete.id)) {
      setRoutineToDelete(null);
      setShowDeleteRoutineConfirm(false);
      return;
    }
    dispatch({ type: 'DELETE_WORKOUT_TEMPLATE', payload: routineToDelete.id });
    setRoutineToDelete(null);
    setShowDeleteRoutineConfirm(false);
  }

  function handleSaveSessionAsRoutine(session) {
    if (!session) return;
    setEditingRoutineId(null);
    setRoutineName(`${session.name} Routine`);
    setRoutineDescription(`Routine saved from workout on ${session.date}`);
    setRoutineExercises(
      (session.exercises || []).map(ex => {
        const validSets = (ex.sets || []).filter(s => s.reps);
        const avgReps = validSets.length > 0
          ? Math.round(validSets.reduce((acc, s) => acc + (parseInt(s.reps, 10) || 0), 0) / validSets.length)
          : 10;
        return {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName || getExerciseName(ex.exerciseId),
          sets: Math.max(1, ex.sets?.length || 3),
          reps: avgReps || 10,
        };
      })
    );
    setSelectedSession(null);
    setShowRoutineModal(true);
  }

  function getExerciseName(id) {
    const local = localExercises.find(e => e.id === id);
    if (local) return local.name;
    const fromWger = wgerData.exercises.find(e => e.id === id);
    if (fromWger) return fromWger.name;
    return id.replace(/^(ex_|wger_)/, '').replace(/_/g, ' ');
  }

  function openAddBodyMeasurement() {
    setEditingMeasurement(null);
    setBodyWeight('');
    setBodyWaist('');
    setBodyDate(todayStr());
    setShowBodyForm(true);
  }

  function openEditBodyMeasurement(m) {
    setEditingMeasurement(m);
    setBodyWeight(m.weight !== null && m.weight !== undefined ? String(m.weight) : '');
    setBodyWaist(m.waist !== null && m.waist !== undefined ? String(m.waist) : '');
    setBodyDate(m.date || todayStr());
    setShowBodyForm(true);
  }

  function deleteBodyMeasurement(id) {
    if (window.confirm('Are you sure you want to delete this body measurement?')) {
      dispatch({ type: 'DELETE_BODY_MEASUREMENT', payload: id });
    }
  }

  function saveBodyMeasurement() {
    if (!bodyWeight && !bodyWaist) return;
    const weightNum = bodyWeight ? parseFloat(bodyWeight) : null;
    const waistNum = bodyWaist ? parseFloat(bodyWaist) : null;
    const unit = state.preferences.units === 'imperial' ? 'lb' : 'kg';

    if (editingMeasurement) {
      dispatch({
        type: 'UPDATE_BODY_MEASUREMENT',
        payload: {
          ...editingMeasurement,
          date: bodyDate || editingMeasurement.date,
          weight: weightNum,
          waist: waistNum,
          unit: editingMeasurement.unit || unit,
          updatedAt: new Date().toISOString(),
        },
      });
    } else {
      dispatch({
        type: 'ADD_BODY_MEASUREMENT',
        payload: {
          id: generateId(),
          date: bodyDate || todayStr(),
          weight: weightNum,
          waist: waistNum,
          unit,
          createdAt: new Date().toISOString(),
        },
      });
    }

    setEditingMeasurement(null);
    setBodyWeight('');
    setBodyWaist('');
    setShowBodyForm(false);
  }

  function handleSaveCustomExercise() {
    if (!customExName.trim()) return;

    const newEx = {
      id: `custom_${generateId()}`,
      name: customExName.trim(),
      category: customExCategory,
      equipment: customExEquipment,
      muscles: customExMuscles ? customExMuscles.split(',').map(m => m.trim()) : [customExCategory],
      instructions: customExInstructions.trim() || 'Custom user created exercise.',
      isCustom: true,
      source: 'Custom Exercise',
    };

    dispatch({ type: 'ADD_EXERCISE', payload: newEx });
    setCustomExName('');
    setCustomExMuscles('');
    setCustomExInstructions('');
    setShowCustomExModal(false);
  }

  function getSessionDuration(s) {
    if (!s.startTime || !s.endTime) return '—';
    const ms = new Date(s.endTime) - new Date(s.startTime);
    const min = Math.round(ms / 60000);
    return `${min} min`;
  }

  function getSessionVolume(s) {
    let volume = 0;
    (s.exercises || []).forEach(ex => (ex.sets || []).forEach(set => {
      if (set.completed && set.weight && set.reps) {
        volume += parseFloat(set.weight) * parseInt(set.reps, 10);
      }
    }));
    return volume;
  }

  const hasActiveFilters = Boolean(selectedCategory || selectedMuscle || selectedEquipment || exerciseSearch);

  function resetFilters() {
    setExerciseSearch('');
    setSelectedCategory('');
    setSelectedMuscle('');
    setSelectedEquipment('');
    setCurrentPage(1);
  }

  // Active workout screen
  if (activeSession && !isWorkoutMinimized) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-accent)]">
                Workout in progress
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--color-text-primary)]">
              {activeSession.name}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsWorkoutMinimized(true)}
              title="Minimize to browse workouts or exercise library"
            >
              <Minimize2 size={14} /> Minimize
            </Button>
            <Button variant="danger" size="sm" onClick={discardWorkout}>
              Discard
            </Button>
            <Button size="sm" onClick={finishWorkout}>
              <Square size={14} className="fill-current" /> Finish Session
            </Button>
          </div>
        </div>

        {/* Rest Timer Banner */}
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)] shadow-[0_0_16px_rgba(132,204,22,0.2)]">
                <Timer size={24} />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                  Rest Timer
                </p>
                <p className="text-3xl font-black font-mono tracking-tight text-[var(--color-text-primary)]">
                  {Math.floor(restTimer / 60)}:{String(restTimer % 60).padStart(2, '0')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {[60, 90, 120].map(t => (
                <button
                  key={t}
                  onClick={() => { setRestTimer(t); setRestRunning(true); setRestAlert(false); }}
                  className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-bold text-[var(--color-text-primary)] hover:bg-white/[0.08] transition-all"
                >
                  +{t}s
                </button>
              ))}
              {restRunning && (
                <button
                  onClick={() => { setRestRunning(false); setRestTimer(0); }}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/20 text-rose-400 text-xs font-bold hover:bg-rose-500/25 transition-all"
                >
                  Stop
                </button>
              )}
            </div>
          </div>
          {restAlert && (
            <div className="p-3 rounded-xl bg-lime-500/15 border border-lime-500/30 text-lime-400 text-xs font-bold flex items-center justify-between">
              <span>⚡ Rest period complete! Ready for your next set.</span>
              <button onClick={() => setRestAlert(false)} className="text-[10px] uppercase font-mono underline ml-2">
                Dismiss
              </button>
            </div>
          )}
        </Card>

        {/* Exercises in Session */}
        <div className="space-y-4">
          {activeSession.exercises.map((ex, exIdx) => (
            <Card key={exIdx} className="p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
                    <Dumbbell size={16} />
                  </div>
                  <h3 className="font-bold text-base text-[var(--color-text-primary)] truncate">
                    {ex.exerciseName || getExerciseName(ex.exerciseId)}
                  </h3>
                </div>
                <button
                  onClick={() => removeExFromSession(exIdx)}
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[2.5rem_1fr_1fr_3rem] gap-2 text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider font-bold px-1">
                  <span>Set</span>
                  <span>Weight ({state.preferences.units === 'imperial' ? 'lb' : 'kg'})</span>
                  <span>Reps</span>
                  <span className="text-center">Done</span>
                </div>

                {ex.sets.map((set, setIdx) => (
                  <div
                    key={setIdx}
                    className={`grid grid-cols-[2.5rem_1fr_1fr_3rem] gap-2 items-center p-2 rounded-xl transition-colors ${
                      set.completed ? 'bg-[var(--color-accent-dim)]/40 border border-[var(--color-accent)]/20' : 'bg-white/[0.02]'
                    }`}
                  >
                    <span className="text-xs font-bold text-[var(--color-text-tertiary)] text-center">
                      #{setIdx + 1}
                    </span>
                    <input
                      type="number"
                      placeholder="0"
                      value={set.weight}
                      onChange={e => updateSet(exIdx, setIdx, 'weight', e.target.value)}
                      className="!py-1.5 text-center font-mono font-semibold"
                    />
                    <input
                      type="number"
                      placeholder="0"
                      value={set.reps}
                      onChange={e => updateSet(exIdx, setIdx, 'reps', e.target.value)}
                      className="!py-1.5 text-center font-mono font-semibold"
                    />
                    <button
                      onClick={() => {
                        toggleSetComplete(exIdx, setIdx);
                        if (!ex.sets[setIdx].completed) {
                          setRestTimer(90);
                          setRestRunning(true);
                        }
                      }}
                      className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all mx-auto ${
                        set.completed
                          ? 'bg-[var(--color-accent)] text-black font-black shadow-[0_2px_8px_rgba(132,204,22,0.4)]'
                          : 'bg-white/[0.05] border border-white/[0.08] text-[var(--color-text-tertiary)] hover:border-white/[0.2]'
                      }`}
                    >
                      <Check size={16} strokeWidth={3} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-3 flex justify-start">
                <Button variant="ghost" size="sm" onClick={() => addSet(exIdx)} className="text-xs font-semibold text-[var(--color-accent)]">
                  <Plus size={14} /> Add Set
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Workout Notes */}
        <Card className="p-4">
          <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)] block mb-2">
            Session Notes & Reflections
          </label>
          <textarea
            value={activeSession.notes || ''}
            onChange={e => {
              const notes = e.target.value;
              setActiveSession(prev => ({ ...prev, notes }));
            }}
            placeholder="Log session notes, intensity, RPE, or reminders..."
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-accent)]/50 resize-none font-sans"
          />
        </Card>

        <Button variant="secondary" onClick={() => setShowExerciseLib(true)} className="w-full">
          <Plus size={16} /> Add Exercise from Library / wger API
        </Button>

        {/* Discard Confirmation Modal */}
        {showDiscardConfirm && (
          <Modal
            isOpen={showDiscardConfirm}
            onClose={() => setShowDiscardConfirm(false)}
            title="Discard Workout?"
          >
            <div className="space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Are you sure you want to discard <strong className="text-[var(--color-text-primary)]">{activeSession.name}</strong>?
                All logged sets, weights, and reps for this session will be permanently deleted.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>
                  Keep Workout
                </Button>
                <Button variant="danger" onClick={confirmDiscardWorkout}>
                  Yes, Discard Workout
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Training & Workouts"
        subtitle="Manage routine templates, exercises via wger REST API, and body progression"
        action={
          activeSession ? (
            <Button onClick={() => setIsWorkoutMinimized(false)} size="sm">
              <Play size={16} className="fill-current" /> Resume Workout
            </Button>
          ) : (
            <Button onClick={() => setShowStart(true)} size="sm">
              <Play size={16} className="fill-current" /> Start Workout
            </Button>
          )
        }
      />

      {/* Active Workout In-Progress Banner */}
      {activeSession && (
        <Card className="mb-6 p-4.5 bg-gradient-to-r from-[var(--color-accent-dim)]/50 via-[var(--color-accent-dim)]/20 to-transparent border border-[var(--color-accent)]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_0_24px_rgba(132,204,22,0.15)]">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/40 flex items-center justify-center text-[var(--color-accent)] shrink-0 animate-pulse shadow-[0_0_16px_rgba(132,204,22,0.25)]">
              <Dumbbell size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-ping" />
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-accent)]">
                  Active Workout in Progress
                </span>
                <span className="text-xs text-[var(--color-text-tertiary)]">•</span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {activeSession.exercises?.length || 0} exercise{activeSession.exercises?.length === 1 ? '' : 's'}
                </span>
              </div>
              <h3 className="text-base sm:text-lg font-black text-[var(--color-text-primary)]">
                {activeSession.name}
              </h3>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowDiscardConfirm(true)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              onClick={() => setIsWorkoutMinimized(false)}
            >
              <Play size={14} className="fill-current" /> Resume Workout
            </Button>
          </div>
        </Card>
      )}

      <TabBar
        tabs={[
          { key: 'workout', label: 'Workout Sessions' },
          { key: 'exercises', label: 'Exercise Library (wger API)' },
          { key: 'body', label: 'Body Measurements' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'workout' && (
        <div className="space-y-5">
          {/* Volume Progression Chart */}
          {volumeTrend.length > 1 && (
            <Card className="p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[var(--color-text-primary)]">Volume Progression</h3>
                    <p className="text-xs text-[var(--color-text-tertiary)]">
                      Total training workload across last {volumeTrend.length} workouts
                    </p>
                  </div>
                </div>
                <span className="text-xs font-semibold text-[var(--color-text-secondary)] px-2.5 py-1 rounded-lg bg-white/[0.04]">
                  Unit: {state.preferences.units === 'imperial' ? 'lb' : 'kg'}
                </span>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={volumeTrend} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-body)" stopOpacity={0.35}/>
                      <stop offset="95%" stopColor="var(--color-body)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--color-text-tertiary)' }} />
                  <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(20, 20, 25, 0.95)',
                      backdropFilter: 'blur(16px)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '14px',
                      fontSize: '12px',
                    }}
                    formatter={(val) => [`${val.toLocaleString()} ${state.preferences.units === 'imperial' ? 'lb' : 'kg'}`, 'Volume']}
                  />
                  <Area type="monotone" dataKey="volume" stroke="var(--color-body)" fill="url(#volGrad)" strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Workout Routines & Templates Section */}
          <Card className="p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)]">
                  <Dumbbell size={16} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[var(--color-text-primary)]">
                    Workout Routines & Splits
                  </h3>
                  <p className="text-xs text-[var(--color-text-tertiary)]">
                    {allTemplates.length} routines available ({defaultWorkoutTemplates.length} default presets)
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={openCreateRoutine}>
                <Plus size={14} /> Create Routine
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {allTemplates.map(t => {
                const isDefault = DEFAULT_TEMPLATE_IDS.includes(t.id);
                return (
                  <div
                    key={t.id}
                    className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex flex-col justify-between gap-3 hover:border-white/[0.12] transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <h4 className="font-bold text-sm text-[var(--color-text-primary)] truncate">
                            {t.name}
                          </h4>
                          {isDefault ? (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/[0.06] text-[var(--color-text-tertiary)] shrink-0">
                              Default
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--color-accent-dim)] text-[var(--color-accent)] border border-[var(--color-accent)]/30 shrink-0">
                              Custom
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => openEditRoutine(t)}
                            title="Edit Routine"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] transition-colors"
                          >
                            <Edit3 size={13} />
                          </button>
                          {!isDefault && (
                            <button
                              onClick={() => {
                                setRoutineToDelete(t);
                                setShowDeleteRoutineConfirm(true);
                              }}
                              title="Delete Routine"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] line-clamp-2 mb-2">
                        {t.description || `${t.exercises?.length || 0} exercises target routine`}
                      </p>
                      <div className="flex flex-wrap gap-1 text-[11px] text-[var(--color-text-tertiary)]">
                        <span>{t.exercises?.length || 0} exercises</span>
                        <span>•</span>
                        <span>
                          {(t.exercises || []).reduce((acc, ex) => acc + (parseInt(ex.sets, 10) || 3), 0)} total sets
                        </span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => startWorkout(t)}
                      className="w-full text-xs font-bold"
                    >
                      <Play size={12} className="fill-current text-[var(--color-accent)]" /> Start Routine
                    </Button>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Past Workout Sessions */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Workout History ({sessions.length})
              </h3>
            </div>
            {sessions.length === 0 ? (
              <EmptyState
                icon={Dumbbell}
                title="No workouts recorded yet"
                description="Start a quick session or select a routine above to log sets, reps, and track your training volume."
                action={
                  <Button onClick={() => setShowStart(true)} size="sm">
                    <Play size={16} className="fill-current" /> Start First Workout
                  </Button>
                }
              />
            ) : (
              <div className="space-y-3">
              {sessions.map(s => (
                <Card
                  key={s.id}
                  className="flex items-center gap-4 cursor-pointer hover:border-white/[0.18] transition-all p-4"
                  onClick={() => setSelectedSession(s)}
                >
                  <div className="w-11 h-11 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center shrink-0 text-rose-400">
                    <Dumbbell size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-[var(--color-text-primary)] truncate">{s.name}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                      {s.date} · {getSessionDuration(s)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-[var(--color-text-primary)]">
                      {s.exercises.length} exercise{s.exercises.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-xs font-semibold text-[var(--color-accent)] mt-0.5">
                      {getSessionVolume(s).toLocaleString()} {state.preferences.units === 'imperial' ? 'lb' : 'kg'}
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-[var(--color-text-tertiary)] shrink-0" />
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    )}

      {tab === 'exercises' && (
        <div className="space-y-5">
          {/* Search, Filters, and Custom Action Container */}
          <Card className="p-4 sm:p-5 space-y-3">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                <input
                  value={exerciseSearch}
                  onChange={e => { setExerciseSearch(e.target.value); setCurrentPage(1); }}
                  placeholder="Search exercise library or wger API (e.g. Bench Press, Squat, Pull-up)..."
                  className="!pl-10 !py-2.5"
                />
              </div>
              <Button size="sm" onClick={() => setShowCustomExModal(true)}>
                <Plus size={16} /> Custom Exercise
              </Button>
            </div>

            {/* Filter Dropdowns with Liquid Glass Styling */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={selectedCategory}
                onChange={e => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
                className="text-xs font-medium"
              >
                {WGER_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>

              <select
                value={selectedMuscle}
                onChange={e => { setSelectedMuscle(e.target.value); setCurrentPage(1); }}
                className="text-xs font-medium"
              >
                {WGER_MUSCLES.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <select
                value={selectedEquipment}
                onChange={e => { setSelectedEquipment(e.target.value); setCurrentPage(1); }}
                className="text-xs font-medium"
              >
                {WGER_EQUIPMENT.map(eq => (
                  <option key={eq.id} value={eq.id}>{eq.name}</option>
                ))}
              </select>
            </div>

            {/* Results count & reset filters */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/[0.06] text-xs text-[var(--color-text-tertiary)]">
              <div className="flex items-center gap-2">
                <span>Data source:</span>
                <span className="font-semibold text-[var(--color-text-secondary)]">
                  {wgerData.source || 'wger REST API'}
                </span>
                {wgerData.isFallback && (
                  <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full font-medium">
                    Offline Cache Active
                  </span>
                )}
                {hasActiveFilters && (
                  <button
                    onClick={resetFilters}
                    className="text-[11px] text-[var(--color-accent)] font-semibold hover:underline ml-2"
                  >
                    Reset all filters
                  </button>
                )}
              </div>
              <a
                href="https://wger.de"
                target="_blank"
                rel="noreferrer"
                className="hover:text-[var(--color-accent)] inline-flex items-center gap-1 text-[11px] transition-colors"
              >
                Licensed under CC-BY-SA 4.0 <ExternalLink size={10} />
              </a>
            </div>
          </Card>

          {loadingWger ? (
            <div className="py-16 text-center text-sm text-[var(--color-text-secondary)] flex flex-col items-center gap-3">
              <RefreshCw size={26} className="animate-spin text-[var(--color-accent)]" />
              <p className="font-medium">Connecting to wger REST API & exercise database...</p>
            </div>
          ) : wgerError ? (
            <Card className="p-6 text-center border-red-500/25 bg-red-500/5">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 text-red-400 mx-auto flex items-center justify-center mb-3">
                <Info size={24} />
              </div>
              <h3 className="font-bold text-base text-[var(--color-text-primary)] mb-1">
                Unable to load exercises from wger API
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto mb-4 leading-relaxed">
                {wgerError}
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button size="sm" onClick={() => setRetryTrigger(t => t + 1)}>
                  <RefreshCw size={14} /> Retry Request
                </Button>
              </div>
            </Card>
          ) : wgerData.exercises.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No exercises match your search"
              description="Try adjusting your category, equipment, or muscle filters, or create a custom exercise."
              action={
                <Button size="sm" onClick={resetFilters}>
                  Reset Filters
                </Button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 mb-6">
              {wgerData.exercises.map(ex => {
                const pr = personalRecords[ex.id];
                return (
                  <Card
                    key={ex.id}
                    className="flex flex-col justify-between p-4 hover:border-white/[0.18] transition-all cursor-pointer group"
                    onClick={() => setSelectedExerciseDetail(ex)}
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-2.5">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <ExerciseThumbnail src={ex.thumbnailUrl || ex.imageUrl} alt={ex.name} size="md" />
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-[var(--color-text-primary)] leading-snug truncate group-hover:text-[var(--color-accent)] transition-colors">
                              {ex.name}
                            </h4>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] capitalize truncate">
                                {ex.categoryName || ex.category}
                              </span>
                              <span className="w-1 h-1 rounded-full bg-white/20 shrink-0" />
                              <span className="text-[11px] text-[var(--color-text-tertiary)] capitalize truncate">
                                {ex.equipment}
                              </span>
                            </div>
                          </div>
                        </div>

                        {pr && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full shrink-0">
                            <Trophy size={10} /> PR: {pr.weight} {state.preferences.units === 'imperial' ? 'lb' : 'kg'}
                          </span>
                        )}
                      </div>

                      {/* Instructions snippet */}
                      <p className={`text-xs ${ex.instructions === 'Instructions not available' ? 'text-[var(--color-text-tertiary)] italic' : 'text-[var(--color-text-secondary)]'} line-clamp-2 mb-3 leading-relaxed`}>
                        {ex.instructions}
                      </p>
                    </div>

                    {/* Card Footer */}
                    <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06] text-[11px] text-[var(--color-text-tertiary)]">
                      <span className="truncate max-w-[210px] font-medium">
                        {ex.muscles && ex.muscles.length > 0
                          ? `Muscles: ${ex.muscles.slice(0, 3).join(', ')}`
                          : `Category: ${ex.categoryName || ex.category}`}
                      </span>
                      <span className="text-[var(--color-accent)] font-semibold inline-flex items-center gap-0.5 shrink-0 group-hover:translate-x-0.5 transition-transform">
                        Details <ChevronRight size={13} />
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination Controls */}
          {wgerData.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2 pb-6">
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              >
                <ChevronLeft size={14} /> Previous
              </Button>
              <span className="text-xs font-semibold text-[var(--color-text-secondary)] px-3 py-1.5 rounded-xl bg-white/[0.04]">
                Page {currentPage} of {wgerData.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={currentPage >= wgerData.totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Next <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>
      )}

      {tab === 'body' && (
        <div className="space-y-4">
          <Button onClick={openAddBodyMeasurement} size="sm">
            <Plus size={16} /> Add Measurement
          </Button>

          {(state.bodyMeasurements || []).length === 0 ? (
            <EmptyState
              icon={Weight}
              title="No body measurements logged"
              description="Track your body weight and waist circumference over the 90 days to visualize your physical transformation."
              action={
                <Button size="sm" onClick={openAddBodyMeasurement}>
                  <Plus size={16} /> Log Initial Weight
                </Button>
              }
            />
          ) : (
            <div className="space-y-2.5">
              {[...(state.bodyMeasurements || [])].sort((a, b) => b.date.localeCompare(a.date)).map(m => (
                <Card key={m.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-bold text-[var(--color-text-primary)]">{m.date}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">Physical metric log</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.weight && <Badge>{m.weight} {m.unit || 'kg'}</Badge>}
                    {m.waist && <Badge color="var(--color-info)">{m.waist} cm waist</Badge>}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditBodyMeasurement(m)}
                      className="p-1.5 h-auto text-[var(--color-text-secondary)] hover:text-white"
                      aria-label={`Edit measurement for ${m.date}`}
                    >
                      <Edit3 size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteBodyMeasurement(m.id)}
                      className="p-1.5 h-auto text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      aria-label={`Delete measurement for ${m.date}`}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Start Workout */}
      <Modal isOpen={showStart} onClose={() => setShowStart(false)} title="Start Workout">
        <div className="space-y-3">
          <button
            onClick={() => startWorkout(null)}
            className="w-full flex items-center gap-3.5 p-4 rounded-2xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/25 transition-all text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)] text-black flex items-center justify-center font-bold shrink-0">
              <Dumbbell size={20} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm text-[var(--color-text-primary)]">Empty Workout</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Start blank and add exercises on the fly</p>
            </div>
            <ChevronRight size={16} className="text-[var(--color-accent)] shrink-0" />
          </button>

          {allTemplates.length > 0 && (
            <>
              <p className="text-[10px] font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider pt-2 px-1">
                Workout Templates
              </p>
              {allTemplates.map(t => (
                <button
                  key={t.id}
                  onClick={() => startWorkout(t)}
                  className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12] transition-all text-left"
                >
                  <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center text-[var(--color-text-tertiary)] shrink-0">
                    <Dumbbell size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--color-text-primary)] truncate">{t.name}</p>
                    <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{t.description || `${t.exercises.length} exercises`}</p>
                  </div>
                  <ChevronRight size={14} className="text-[var(--color-text-tertiary)] shrink-0" />
                </button>
              ))}
            </>
          )}

          <div className="pt-2 border-t border-white/[0.08]">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowStart(false);
                openCreateRoutine();
              }}
              className="w-full text-xs text-[var(--color-accent)] font-semibold justify-center"
            >
              <Plus size={14} /> Create New Routine
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Exercise Picker for Active Workout */}
      <Modal isOpen={showExerciseLib} onClose={() => setShowExerciseLib(false)} title="Add Exercise to Workout" maxWidth="max-w-xl">
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            value={exerciseSearch}
            onChange={e => setExerciseSearch(e.target.value)}
            placeholder="Search exercises from wger API & local database..."
            className="!pl-10"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {wgerData.exercises.map(ex => (
            <button
              key={ex.id}
              onClick={() => addExerciseToSession(ex)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-white/[0.06] transition-colors bg-white/[0.03] border border-white/[0.06]"
            >
              <ExerciseThumbnail src={ex.thumbnailUrl || ex.imageUrl} alt={ex.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{ex.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] capitalize mt-0.5">
                  {ex.categoryName || ex.category} · {ex.equipment}
                </p>
              </div>
              <Plus size={16} className="text-[var(--color-accent)] shrink-0" />
            </button>
          ))}
        </div>
      </Modal>

      {/* MODAL: Exercise Instructions & CC Licensing Details */}
      <Modal
        isOpen={Boolean(selectedExerciseDetail)}
        onClose={() => setSelectedExerciseDetail(null)}
        title={selectedExerciseDetail?.name || 'Exercise Details'}
        maxWidth="max-w-xl"
      >
        {selectedExerciseDetail && (
          <div className="space-y-4">
            {selectedExerciseDetail.hasImage && selectedExerciseDetail.imageUrl && !detailImgError && (
              <div className="rounded-2xl overflow-hidden bg-black/70 border border-white/[0.1] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)] flex flex-col items-center justify-center p-3 min-h-[170px]">
                <img
                  src={selectedExerciseDetail.imageUrl}
                  alt={selectedExerciseDetail.name}
                  onError={() => setDetailImgError(true)}
                  className="max-h-64 object-contain rounded-xl"
                />
                {selectedExerciseDetail.imageAuthor && (
                  <p className="text-[10px] text-[var(--color-text-tertiary)] mt-2 text-center">
                    Demonstration image © {selectedExerciseDetail.imageAuthor} ({selectedExerciseDetail.imageLicense})
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[var(--color-text-tertiary)] uppercase text-[10px] font-bold block mb-1 tracking-wider">
                  Category
                </span>
                <span className="font-bold text-[var(--color-text-primary)] capitalize">
                  {selectedExerciseDetail.categoryName || selectedExerciseDetail.category}
                </span>
              </div>
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                <span className="text-[var(--color-text-tertiary)] uppercase text-[10px] font-bold block mb-1 tracking-wider">
                  Equipment
                </span>
                <span className="font-bold text-[var(--color-text-primary)] capitalize">
                  {selectedExerciseDetail.equipment}
                </span>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
                Target Muscles
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedExerciseDetail.muscles && selectedExerciseDetail.muscles.length > 0 ? (
                  selectedExerciseDetail.muscles.map(m => (
                    <Badge key={m} color="var(--color-accent)">{m}</Badge>
                  ))
                ) : (
                  <span className="text-xs text-[var(--color-text-tertiary)]">General full body compound</span>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2">
                Execution & Form Instructions
              </p>
              <div className={`p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-xs leading-relaxed ${selectedExerciseDetail.instructions === 'Instructions not available' ? 'text-[var(--color-text-tertiary)] italic' : 'text-[var(--color-text-secondary)]'} whitespace-pre-line`}>
                {selectedExerciseDetail.instructions}
              </div>
            </div>

            {/* License & Attribution Notice */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-[11px] text-[var(--color-text-tertiary)] space-y-1">
              <p className="font-bold text-[var(--color-text-secondary)]">Creative Commons Attribution Compliance</p>
              <p>{selectedExerciseDetail.attributionText}</p>
              <p>
                License:{' '}
                <a
                  href={selectedExerciseDetail.licenseUrl || 'https://creativecommons.org/licenses/by-sa/4.0/'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[var(--color-accent)] underline inline-flex items-center gap-1 font-semibold"
                >
                  {selectedExerciseDetail.license} <ExternalLink size={10} />
                </a>
              </p>
            </div>

            <Button
              onClick={() => {
                startWorkout({
                  name: selectedExerciseDetail.name,
                  exercises: [{ exerciseId: selectedExerciseDetail.id, sets: 3, reps: 10 }],
                });
                setSelectedExerciseDetail(null);
              }}
              className="w-full"
            >
              <Play size={14} className="fill-current" /> Start Workout with this Exercise
            </Button>
          </div>
        )}
      </Modal>

      {/* MODAL: Custom Exercise Creation */}
      <Modal
        isOpen={showCustomExModal}
        onClose={() => setShowCustomExModal(false)}
        title="Create Custom Exercise"
      >
        <div className="space-y-3.5">
          <div>
            <label htmlFor="custom-exercise-name" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
              Exercise Name
            </label>
            <input
              id="custom-exercise-name"
              value={customExName}
              onChange={e => setCustomExName(e.target.value)}
              placeholder="e.g., Landmine Press"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="custom-exercise-category" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                Category
              </label>
              <select id="custom-exercise-category" value={customExCategory} onChange={e => setCustomExCategory(e.target.value)}>
                <option value="chest">Chest</option>
                <option value="back">Back</option>
                <option value="shoulders">Shoulders</option>
                <option value="arms">Arms</option>
                <option value="legs">Legs</option>
                <option value="core">Core</option>
                <option value="cardio">Cardio</option>
              </select>
            </div>
            <div>
              <label htmlFor="custom-exercise-equipment" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                Equipment
              </label>
              <select id="custom-exercise-equipment" value={customExEquipment} onChange={e => setCustomExEquipment(e.target.value)}>
                <option value="barbell">Barbell</option>
                <option value="dumbbell">Dumbbell</option>
                <option value="bodyweight">Bodyweight</option>
                <option value="cable">Cable</option>
                <option value="machine">Machine</option>
                <option value="kettlebell">Kettlebell</option>
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="custom-exercise-muscles" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
              Target Muscles (comma separated)
            </label>
            <input
              id="custom-exercise-muscles"
              value={customExMuscles}
              onChange={e => setCustomExMuscles(e.target.value)}
              placeholder="e.g., upper chest, triceps, anterior deltoid"
            />
          </div>
          <div>
            <label htmlFor="custom-exercise-instructions" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
              Execution Instructions & Form
            </label>
            <textarea
              id="custom-exercise-instructions"
              value={customExInstructions}
              onChange={e => setCustomExInstructions(e.target.value)}
              rows={3}
              placeholder="Describe posture, breathing, and safety tips..."
            />
          </div>
          <Button onClick={handleSaveCustomExercise} disabled={!customExName.trim()} className="w-full">
            Save Exercise to Library
          </Button>
        </div>
      </Modal>

      {/* Body measurement modal */}
      <Modal
        isOpen={showBodyForm}
        onClose={() => {
          setShowBodyForm(false);
          setEditingMeasurement(null);
        }}
        title={editingMeasurement ? 'Edit Body Measurement' : 'Log Body Measurement'}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="body-measurement-date" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Measurement Date
            </label>
            <input
              id="body-measurement-date"
              type="date"
              value={bodyDate}
              onChange={e => setBodyDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="body-measurement-weight" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Weight ({state.preferences.units === 'imperial' ? 'lb' : 'kg'})
            </label>
            <input
              id="body-measurement-weight"
              type="number"
              step="0.1"
              value={bodyWeight}
              onChange={e => setBodyWeight(e.target.value)}
              placeholder="e.g., 75"
            />
          </div>
          <div>
            <label htmlFor="body-measurement-waist" className="text-xs font-bold text-[var(--color-text-secondary)] mb-1 block">
              Waist Circumference (cm)
            </label>
            <input
              id="body-measurement-waist"
              type="number"
              step="0.1"
              value={bodyWaist}
              onChange={e => setBodyWaist(e.target.value)}
              placeholder="e.g., 82"
            />
          </div>
          <Button onClick={saveBodyMeasurement} disabled={!bodyWeight && !bodyWaist} className="w-full">
            {editingMeasurement ? 'Update Measurement' : 'Save Measurement'}
          </Button>
        </div>
      </Modal>

      {/* Workout session details modal */}
      <Modal
        isOpen={Boolean(selectedSession)}
        onClose={() => setSelectedSession(null)}
        title={selectedSession?.name || 'Workout Details'}
      >
        {selectedSession && (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.08]">
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)] uppercase font-bold tracking-wider">Date & Duration</p>
                <p className="text-sm font-bold text-[var(--color-text-primary)] mt-0.5">{selectedSession.date} · {getSessionDuration(selectedSession)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-[var(--color-text-tertiary)] uppercase font-bold tracking-wider">Total Volume</p>
                <p className="text-sm font-black text-[var(--color-accent)] mt-0.5">
                  {getSessionVolume(selectedSession).toLocaleString()} {state.preferences.units === 'imperial' ? 'lb' : 'kg'}
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
              {(selectedSession.exercises || []).map((ex, idx) => (
                <div key={idx} className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="font-bold text-sm text-[var(--color-text-primary)] mb-2.5">
                    {ex.exerciseName || getExerciseName(ex.exerciseId)}
                  </p>
                  <div className="space-y-1.5">
                    {(ex.sets || []).map((set, sIdx) => (
                      <div key={sIdx} className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                        <span className="text-[var(--color-text-tertiary)] font-bold">Set {sIdx + 1}</span>
                        <span className="font-mono font-medium">{set.weight || 0} {state.preferences.units === 'imperial' ? 'lb' : 'kg'} × {set.reps || 0} reps</span>
                        <span className={set.completed ? 'text-[var(--color-accent)] font-bold' : 'text-[var(--color-text-tertiary)]'}>
                          {set.completed ? '✓ Completed' : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => handleSaveSessionAsRoutine(selectedSession)}
              >
                <BookmarkPlus size={14} /> Save as Routine
              </Button>
              <Button
                variant="danger"
                size="sm"
                className="flex-1"
                onClick={() => {
                  dispatch({ type: 'DELETE_WORKOUT_SESSION', payload: selectedSession.id });
                  setSelectedSession(null);
                }}
              >
                <Trash2 size={14} /> Delete Workout
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Discard Confirmation Modal (when on minimized tab view) */}
      {showDiscardConfirm && (
        <Modal
          isOpen={showDiscardConfirm}
          onClose={() => setShowDiscardConfirm(false)}
          title="Discard Workout?"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Are you sure you want to discard <strong className="text-[var(--color-text-primary)]">{activeSession?.name}</strong>?
              All logged sets, weights, and reps for this session will be permanently deleted.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowDiscardConfirm(false)}>
                Keep Workout
              </Button>
              <Button variant="danger" onClick={confirmDiscardWorkout}>
                Yes, Discard Workout
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: Routine Creator & Editor */}
      <Modal
        isOpen={showRoutineModal}
        onClose={() => setShowRoutineModal(false)}
        title={editingRoutineId ? 'Edit Workout Routine' : 'Create Workout Routine'}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="routine-name-input" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
              Routine Name
            </label>
            <input
              id="routine-name-input"
              value={routineName}
              onChange={e => setRoutineName(e.target.value)}
              placeholder="e.g. Upper Body Hypertrophy, Heavy Leg Day..."
              className="w-full font-semibold"
            />
          </div>

          <div>
            <label htmlFor="routine-description-input" className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
              Description / Target Split
            </label>
            <input
              id="routine-description-input"
              value={routineDescription}
              onChange={e => setRoutineDescription(e.target.value)}
              placeholder="e.g. Focus on chest, shoulders and lats with moderate rest intervals"
              className="w-full"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">
                Routine Exercises ({routineExercises.length})
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRoutineExPicker(true)}
                className="text-xs font-semibold text-[var(--color-accent)]"
              >
                <Plus size={14} /> Add Exercise
              </Button>
            </div>

            {routineExercises.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-white/[0.02] border border-dashed border-white/[0.1] text-xs text-[var(--color-text-tertiary)]">
                No exercises added yet. Click &quot;Add Exercise&quot; to pick exercises for this routine.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {routineExercises.map((re, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">
                        {re.exerciseName || getExerciseName(re.exerciseId)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[var(--color-text-tertiary)] font-bold">SETS</span>
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={re.sets}
                          onChange={e => updateRoutineExercise(idx, 'sets', e.target.value)}
                          className="!w-14 !py-1 text-center font-mono font-semibold"
                          aria-label={`Target sets for ${re.exerciseName || getExerciseName(re.exerciseId)}`}
                        />
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-[var(--color-text-tertiary)] font-bold">REPS</span>
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={re.reps}
                          onChange={e => updateRoutineExercise(idx, 'reps', e.target.value)}
                          className="!w-16 !py-1 text-center font-mono font-semibold"
                          aria-label={`Target reps for ${re.exerciseName || getExerciseName(re.exerciseId)}`}
                        />
                      </div>

                      <button
                        onClick={() => removeExerciseFromRoutine(idx)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Remove Exercise"
                        aria-label={`Remove ${re.exerciseName || getExerciseName(re.exerciseId)} from routine`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
            <Button variant="secondary" onClick={() => setShowRoutineModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveRoutine}
              disabled={!routineName.trim() || routineExercises.length === 0}
            >
              Save Routine
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL: Exercise Picker for Routine Builder */}
      <Modal
        isOpen={showRoutineExPicker}
        onClose={() => setShowRoutineExPicker(false)}
        title="Add Exercise to Routine"
        maxWidth="max-w-xl"
      >
        <div className="relative mb-3">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
          <input
            value={exerciseSearch}
            onChange={e => setExerciseSearch(e.target.value)}
            placeholder="Search exercises to add to routine..."
            className="!pl-10"
            autoFocus
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
          {wgerData.exercises.map(ex => (
            <button
              key={ex.id}
              onClick={() => addExerciseToRoutine(ex)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl text-left hover:bg-white/[0.06] transition-colors bg-white/[0.03] border border-white/[0.06]"
            >
              <ExerciseThumbnail src={ex.thumbnailUrl || ex.imageUrl} alt={ex.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[var(--color-text-primary)] truncate">{ex.name}</p>
                <p className="text-xs text-[var(--color-text-tertiary)] capitalize mt-0.5">
                  {ex.categoryName || ex.category} · {ex.equipment}
                </p>
              </div>
              <Plus size={16} className="text-[var(--color-accent)] shrink-0" />
            </button>
          ))}
        </div>
      </Modal>

      {/* MODAL: Delete Routine Confirmation */}
      {showDeleteRoutineConfirm && routineToDelete && (
        <Modal
          isOpen={showDeleteRoutineConfirm}
          onClose={() => {
            setShowDeleteRoutineConfirm(false);
            setRoutineToDelete(null);
          }}
          title="Delete Workout Routine?"
        >
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Are you sure you want to delete <strong className="text-[var(--color-text-primary)]">{routineToDelete.name}</strong>?
              This custom template will be permanently removed from your routine library.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowDeleteRoutineConfirm(false);
                  setRoutineToDelete(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={confirmDeleteRoutine}
              >
                Yes, Delete Routine
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

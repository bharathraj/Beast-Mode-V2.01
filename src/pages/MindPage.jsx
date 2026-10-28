import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store/StoreContext';
import { generateId, todayStr } from '../utils/storage';
import { Card, Button, Modal, PageHeader, EmptyState, TabBar, Badge } from '../components/ui';
import {
  Brain,
  Smile,
  Frown,
  Meh,
  Heart,
  Moon,
  Timer,
  BookOpen,
  Plus,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Calendar,
} from 'lucide-react';

const MOODS = [
  { value: 5, label: 'Great', emoji: '😄', color: '#22c55e' },
  { value: 4, label: 'Good', emoji: '🙂', color: '#84cc16' },
  { value: 3, label: 'Okay', emoji: '😐', color: '#f59e0b' },
  { value: 2, label: 'Low', emoji: '😔', color: '#f97316' },
  { value: 1, label: 'Bad', emoji: '😢', color: '#ef4444' },
];

export default function MindPage() {
  const { state, dispatch } = useStore();
  const today = todayStr();
  const [tab, setTab] = useState('mood');
  const [showJournal, setShowJournal] = useState(false);
  const [journalText, setJournalText] = useState('');
  const [journalTitle, setJournalTitle] = useState('');
  const [sleepHours, setSleepHours] = useState('');
  const [sleepQuality, setSleepQuality] = useState(3);

  // Meditation timer
  const [medDuration, setMedDuration] = useState(600); // 10 min default
  const [medTime, setMedTime] = useState(0);
  const [medRunning, setMedRunning] = useState(false);
  const medRef = useRef(null);

  useEffect(() => {
    if (medRunning) {
      medRef.current = setInterval(() => {
        setMedTime((t) => {
          if (t + 1 >= medDuration) {
            setMedRunning(false);
            // Save meditation
            dispatch({
              type: 'ADD_MEDITATION',
              payload: {
                id: generateId(),
                date: today,
                duration: medDuration,
                completedAt: new Date().toISOString(),
              },
            });
            return 0;
          }
          return t + 1;
        });
      }, 1000);
    }
    return () => clearInterval(medRef.current);
  }, [medRunning, medDuration, dispatch, today]);

  const todayMood = useMemo(
    () => (state.moodLogs || []).find((m) => m.date === today),
    [state.moodLogs, today]
  );

  function logMood(value) {
    dispatch({
      type: 'ADD_MOOD_LOG',
      payload: { id: generateId(), date: today, value, createdAt: new Date().toISOString() },
    });
  }

  function logSleep() {
    if (!sleepHours) return;
    dispatch({
      type: 'ADD_SLEEP_LOG',
      payload: {
        id: generateId(),
        date: today,
        hours: parseFloat(sleepHours),
        quality: sleepQuality,
        createdAt: new Date().toISOString(),
      },
    });
    setSleepHours('');
  }

  function saveJournal() {
    if (!journalText.trim()) return;
    dispatch({
      type: 'ADD_JOURNAL_ENTRY',
      payload: {
        id: generateId(),
        date: today,
        title: journalTitle.trim() || 'Untitled Reflection',
        content: journalText.trim(),
        createdAt: new Date().toISOString(),
      },
    });
    setJournalTitle('');
    setJournalText('');
    setShowJournal(false);
  }

  const formatTimer = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mind & Mental Performance"
        subtitle="Cultivate psychological resilience, emotional regulation, and deep recovery"
      />

      <TabBar
        tabs={[
          { key: 'mood', label: 'Mood Log' },
          { key: 'sleep', label: 'Sleep Quality' },
          { key: 'meditate', label: 'Meditation' },
          { key: 'journal', label: 'Journal & Reflections' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'mood' && (
        <div className="space-y-5">
          <Card className="text-center py-8 p-5 sm:p-6">
            <h3 className="font-bold text-base text-[var(--color-text-primary)] mb-1">
              How are you feeling today?
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-6">
              Track your daily mood to recognize patterns and optimize energy
            </p>

            <div className="flex justify-center flex-wrap gap-3 sm:gap-4">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => logMood(m.value)}
                  className={`flex flex-col items-center gap-1.5 p-3.5 sm:p-4 rounded-2xl transition-all duration-200 border min-w-[70px] ${
                    todayMood?.value === m.value
                      ? 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/40 shadow-[0_4px_16px_rgba(132,204,22,0.25)] scale-105'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.12]'
                  }`}
                >
                  <span className="text-2xl sm:text-3xl">{m.emoji}</span>
                  <span className="text-xs font-bold text-[var(--color-text-primary)]">{m.label}</span>
                </button>
              ))}
            </div>

            {todayMood && (
              <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/20 text-xs font-semibold text-[var(--color-accent)]">
                <Sparkles size={13} />
                <span>
                  Logged today as: {MOODS.find((m) => m.value === todayMood.value)?.label}
                </span>
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-bold text-sm text-[var(--color-text-primary)] mb-3">
              Recent Mood Log
            </h3>
            {(state.moodLogs || []).length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center">
                No mood entries recorded yet
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {[...(state.moodLogs || [])]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 14)
                  .map((l) => {
                    const mood = MOODS.find((m) => m.value === l.value);
                    return (
                      <div
                        key={l.id}
                        className="flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.05]"
                      >
                        <span className="text-xl">{mood?.emoji}</span>
                        <span className="text-xs font-bold text-[var(--color-text-primary)] flex-1">
                          {l.date}
                        </span>
                        <span
                          className="text-xs font-bold px-2.5 py-0.5 rounded-full"
                          style={{
                            background: `${mood?.color || '#84cc16'}20`,
                            color: mood?.color || '#84cc16',
                          }}
                        >
                          {mood?.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'sleep' && (
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <h3 className="font-bold text-base text-[var(--color-text-primary)] mb-1">
              Log Sleep Duration & Quality
            </h3>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-4">
              Rest is foundational to muscle recovery and cognitive focus
            </p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1.5 block">
                  Hours Slept
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="24"
                  value={sleepHours}
                  onChange={(e) => setSleepHours(e.target.value)}
                  placeholder="e.g., 7.5"
                  className="font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[var(--color-text-secondary)] mb-1.5 block">
                  Subjective Sleep Quality
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((q) => (
                    <button
                      key={q}
                      onClick={() => setSleepQuality(q)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all ${
                        sleepQuality === q
                          ? 'bg-[var(--color-accent)] text-black shadow-[0_2px_8px_rgba(132,204,22,0.3)]'
                          : 'bg-white/[0.04] border border-white/[0.06] text-[var(--color-text-secondary)] hover:bg-white/[0.08]'
                      }`}
                    >
                      {q} {q === 1 ? 'Poor' : q === 5 ? 'Restored' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <Button onClick={logSleep} disabled={!sleepHours} className="w-full">
                Save Sleep Record
              </Button>
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-bold text-sm text-[var(--color-text-primary)] mb-3">
              Sleep History
            </h3>
            {(state.sleepLogs || []).length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-4 text-center">
                No sleep entries logged yet
              </p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {[...(state.sleepLogs || [])]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 14)
                  .map((l) => (
                    <div
                      key={l.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-white/[0.03] border border-white/[0.05]"
                    >
                      <div className="flex items-center gap-2.5">
                        <Moon size={16} className="text-blue-400" />
                        <span className="text-xs font-bold text-[var(--color-text-primary)]">
                          {l.date}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black text-[var(--color-text-primary)] font-mono">
                          {l.hours} hrs
                        </span>
                        <Badge color="var(--color-info)">Quality {l.quality}/5</Badge>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'meditate' && (
        <Card className="text-center py-10 p-5 sm:p-8">
          <div className="w-16 h-16 rounded-3xl bg-[var(--color-accent-dim)] border border-[var(--color-accent)]/30 flex items-center justify-center text-[var(--color-accent)] mx-auto mb-4 shadow-[0_0_24px_rgba(132,204,22,0.25)]">
            <Brain size={32} />
          </div>

          <h3 className="font-extrabold text-lg text-[var(--color-text-primary)] mb-1">
            Mindfulness & Breathwork
          </h3>
          <p className="text-xs text-[var(--color-text-tertiary)] mb-6">
            Center your attention, down-regulate cortisol, and prime focus
          </p>

          <p className="text-6xl font-black font-mono tracking-tight text-[var(--color-text-primary)] mb-6">
            {formatTimer(medRunning ? medTime : medDuration)}
          </p>

          {!medRunning && medTime === 0 && (
            <div className="flex justify-center gap-2 mb-6">
              {[5, 10, 15, 20].map((m) => (
                <button
                  key={m}
                  onClick={() => setMedDuration(m * 60)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    medDuration === m * 60
                      ? 'bg-[var(--color-accent)] text-black'
                      : 'bg-white/[0.04] border border-white/[0.06] text-[var(--color-text-secondary)] hover:bg-white/[0.08]'
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
          )}

          <div className="flex justify-center gap-3">
            {!medRunning ? (
              <Button onClick={() => setMedRunning(true)} size="lg">
                <Play size={18} className="fill-current" /> {medTime > 0 ? 'Resume Session' : 'Begin Meditation'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setMedRunning(false)} size="lg">
                <Pause size={18} /> Pause
              </Button>
            )}
            {(medTime > 0 || medRunning) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setMedRunning(false);
                  setMedTime(0);
                }}
                size="lg"
              >
                <RotateCcw size={18} /> Reset
              </Button>
            )}
          </div>

          <p className="text-xs font-semibold text-[var(--color-text-tertiary)] mt-8">
            {(state.meditations || []).length} completed meditation sessions on record
          </p>
        </Card>
      )}

      {tab === 'journal' && (
        <div className="space-y-4">
          <Button onClick={() => setShowJournal(true)} size="sm">
            <Plus size={16} /> New Entry
          </Button>

          {(state.journalEntries || []).length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No journal reflections yet"
              description="Capture your daily thoughts, breakthroughs, and cognitive clarity."
              action={
                <Button onClick={() => setShowJournal(true)} size="sm">
                  <Plus size={16} /> Write First Reflection
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {[...(state.journalEntries || [])]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((j) => (
                  <Card key={j.id} className="p-4 sm:p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-bold text-base text-[var(--color-text-primary)]">{j.title}</p>
                      <span className="text-xs font-semibold text-[var(--color-text-tertiary)]">{j.date}</span>
                    </div>
                    <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] whitespace-pre-wrap leading-relaxed line-clamp-3">
                      {j.content}
                    </p>
                  </Card>
                ))}
            </div>
          )}

          <Modal
            isOpen={showJournal}
            onClose={() => setShowJournal(false)}
            title="Journal Reflection"
          >
            <div className="space-y-3.5">
              <div>
                <label className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Title
                </label>
                <input
                  value={journalTitle}
                  onChange={(e) => setJournalTitle(e.target.value)}
                  placeholder="Reflection title"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--color-text-secondary)] block mb-1">
                  Your Reflection
                </label>
                <textarea
                  value={journalText}
                  onChange={(e) => setJournalText(e.target.value)}
                  placeholder="What breakthroughs, realizations, or challenges did you encounter?"
                  rows={6}
                  className="resize-none leading-relaxed"
                />
              </div>
              <Button onClick={saveJournal} disabled={!journalText.trim()} className="w-full">
                Save Reflection
              </Button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/StoreContext';
import { CHALLENGE_MODES, createChallenge } from '../../utils/challenge';
import { generateId } from '../../utils/storage';
import { habitTemplates } from '../../data/defaults';
import { Button, Card, Badge } from '../ui';
import { ChevronRight, ChevronLeft, Sparkles, Check, Zap, Flame, Compass, Target, Dumbbell } from 'lucide-react';

const steps = ['welcome', 'profile', 'mode', 'habits', 'ready'];

export default function Onboarding() {
  const { state, dispatch } = useStore();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [selectedMode, setSelectedMode] = useState('beast');
  const [selectedHabits, setSelectedHabits] = useState({});

  const current = steps[step];

  function toggleHabit(cat, idx) {
    const key = `${cat}_${idx}`;
    setSelectedHabits(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function selectAllCategory(cat) {
    const templates = habitTemplates[cat];
    const allSelected = templates.every((_, i) => selectedHabits[`${cat}_${i}`]);
    const updated = { ...selectedHabits };
    templates.forEach((_, i) => { updated[`${cat}_${i}`] = !allSelected; });
    setSelectedHabits(updated);
  }

  function finish() {
    // Save profile
    if (name.trim()) {
      dispatch({ type: 'SET_PROFILE', payload: { name: name.trim() } });
    }

    // Create habits from selected templates
    const habitIds = [];
    Object.entries(selectedHabits).forEach(([key, active]) => {
      if (!active) return;
      const [cat, idx] = key.split('_');
      const template = habitTemplates[cat]?.[parseInt(idx)];
      if (!template) return;
      const id = generateId();
      dispatch({
        type: 'ADD_HABIT',
        payload: {
          id,
          name: template.name,
          description: template.description,
          category: template.category,
          icon: template.icon,
          schedule: 'daily',
          target: null,
          color: null,
          archived: false,
          createdAt: new Date().toISOString(),
        },
      });
      habitIds.push(id);
    });

    // Archive or abandon any existing active challenges to ensure exactly one active challenge remains
    const existingActive = (state.challenges || []).filter(c => c.status === 'active');
    existingActive.forEach(prevChallenge => {
      dispatch({
        type: 'UPDATE_CHALLENGE',
        payload: {
          id: prevChallenge.id,
          status: 'abandoned',
          completedAt: new Date().toISOString(),
        },
      });
    });

    // Create exactly one new active challenge with the newly selected mode
    const challenge = createChallenge(selectedMode, habitIds);
    dispatch({ type: 'ADD_CHALLENGE', payload: challenge });

    // Mark onboarding complete
    dispatch({ type: 'SET_PREFERENCES', payload: { onboardingComplete: true } });
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-lime-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Step Progress Bar */}
      <div className="w-full max-w-xl mb-6 flex items-center gap-1.5 px-2">
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i <= step ? 'bg-lime-500 shadow-[0_0_8px_rgba(132,204,22,0.4)]' : 'bg-white/10'
            }`}
          />
        ))}
      </div>

      <motion.div
        className="w-full max-w-xl p-6 sm:p-8 rounded-3xl bg-[var(--color-bg-secondary)]/95 backdrop-blur-2xl border border-[var(--color-border-primary)] shadow-[0_20px_50px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.08)] relative z-10"
        key={current}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ duration: 0.25 }}
      >
        {current === 'welcome' && (
          <div className="text-center py-4">
            <motion.div
              className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-lime-500 text-black flex items-center justify-center shadow-[0_0_30px_rgba(132,204,22,0.35)]"
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <Zap size={38} strokeWidth={2.5} />
            </motion.div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-[var(--color-text-primary)] mb-3">
              Beastmode 90
            </h1>
            <p className="text-sm sm:text-base text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto leading-relaxed">
              Your personal transformation operating system. Master discipline, track fitness, build mental focus, and elevate your life.
            </p>
            <Button onClick={() => setStep(1)} size="lg" className="w-full sm:w-auto px-8">
              Begin Setup <ChevronRight size={18} />
            </Button>
          </div>
        )}

        {current === 'profile' && (
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] mb-1">
              What's your name?
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mb-6">
              We will use this to personalize your dashboard, reports, and leaderboards.
            </p>
            <input
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={e => setName(e.target.value)}
              className="text-lg py-3.5 px-4 mb-6"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') setStep(2); }}
            />
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(0)}>
                <ChevronLeft size={16} /> Back
              </Button>
              <Button onClick={() => setStep(2)} className="flex-1">
                Continue <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {current === 'mode' && (
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] mb-1">
              Choose your challenge
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mb-6">
              Select the program intensity that matches your current commitments.
            </p>
            <div className="space-y-3 mb-6">
              {Object.values(CHALLENGE_MODES).map(mode => {
                const isSelected = selectedMode === mode.key;
                return (
                  <div
                    key={mode.key}
                    onClick={() => setSelectedMode(mode.key)}
                    className={`flex items-start gap-4 p-4 rounded-2xl cursor-pointer border transition-all ${
                      isSelected
                        ? 'bg-lime-500/[0.08] border-lime-500 shadow-[inset_0_1px_0_0_rgba(132,204,22,0.2)]'
                        : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center text-xl shrink-0 mt-0.5">
                      {mode.key === 'beast' ? <Flame size={20} className="text-orange-400" /> : <Zap size={20} className="text-lime-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-bold text-sm text-[var(--color-text-primary)]">{mode.name}</h3>
                        {mode.duration && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] text-[var(--color-text-tertiary)]">
                            {mode.duration} days
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{mode.description}</p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 ${
                      isSelected ? 'bg-lime-500 border-lime-500 text-black' : 'border-white/20'
                    }`}>
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(1)}>
                <ChevronLeft size={16} /> Back
              </Button>
              <Button onClick={() => setStep(3)} className="flex-1">
                Continue <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {current === 'habits' && (
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] mb-1">
              Select your initial habits
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mb-6">
              Pick your daily core standards. You can edit, add, or customize them at any time.
            </p>
            <div className="space-y-5 mb-6 max-h-[50vh] overflow-y-auto pr-1">
              {Object.entries(habitTemplates).map(([cat, templates]) => (
                <div key={cat}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-tertiary)]">{cat}</h3>
                    <button
                      onClick={() => selectAllCategory(cat)}
                      className="text-xs text-lime-400 hover:underline font-medium"
                    >
                      {templates.every((_, i) => selectedHabits[`${cat}_${i}`]) ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    {templates.map((t, i) => {
                      const key = `${cat}_${i}`;
                      const active = selectedHabits[key];
                      return (
                        <button
                          key={key}
                          onClick={() => toggleHabit(cat, i)}
                          className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs transition-all border ${
                            active
                              ? 'bg-lime-500/[0.08] border-lime-500/40 text-[var(--color-text-primary)]'
                              : 'bg-white/[0.02] border-white/[0.04] text-[var(--color-text-secondary)] hover:bg-white/[0.04]'
                          }`}
                        >
                          <span className="flex-1 font-medium">{t.name}</span>
                          {active ? (
                            <div className="w-5 h-5 rounded-full bg-lime-500 text-black flex items-center justify-center shrink-0">
                              <Check size={12} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border border-white/20 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setStep(2)}>
                <ChevronLeft size={16} /> Back
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1">
                Continue <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}

        {current === 'ready' && (
          <div className="text-center py-4">
            <motion.div
              className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-lime-500 text-black flex items-center justify-center shadow-[0_0_30px_rgba(132,204,22,0.35)]"
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 15 }}
            >
              <Sparkles size={38} strokeWidth={2.5} />
            </motion.div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-[var(--color-text-primary)] mb-2">
              Ready for Transformation
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] mb-1">
              Starting <span className="font-semibold text-lime-400">{CHALLENGE_MODES[selectedMode].name}</span>
              {CHALLENGE_MODES[selectedMode].duration && ` · ${CHALLENGE_MODES[selectedMode].duration} days`}
            </p>
            <p className="text-xs text-[var(--color-text-tertiary)] mb-8">
              {Object.values(selectedHabits).filter(Boolean).length} habits queued for daily tracking
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="secondary" onClick={() => setStep(3)}>
                <ChevronLeft size={16} /> Back
              </Button>
              <Button onClick={finish} size="lg">
                <Sparkles size={18} /> Launch Beast Mode
              </Button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { exportData, importData, clearAllData } from '../utils/storage';
import { CHALLENGE_MODES, createChallenge } from '../utils/challenge';
import { generateId } from '../utils/storage';
import { Card, Button, Modal, PageHeader, Badge } from '../components/ui';
import TransformationReportModal from '../components/challenge/TransformationReportModal';
import {
  Settings, User, Sun, Moon, Download, Upload, Trash2, RotateCcw,
  Shield, Palette, Scale, Calendar, AlertTriangle, Trophy, FileText,
  CheckCircle, ChevronRight, Lock, Check, Zap, Flame, Compass, Heart
} from 'lucide-react';

export default function SettingsPage() {
  const { state, dispatch } = useStore();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [showClear, setShowClear] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSuccess, setImportSuccess] = useState(false);
  const [showNewChallenge, setShowNewChallenge] = useState(false);
  const [newChallengeMode, setNewChallengeMode] = useState('beast');
  const [selectedReportChallenge, setSelectedReportChallenge] = useState(null);

  const pref = state.preferences;
  const profile = state.profile;

  function updateProfile(field, value) {
    dispatch({ type: 'SET_PROFILE', payload: { [field]: value } });
  }

  function updatePref(field, value) {
    dispatch({ type: 'SET_PREFERENCES', payload: { [field]: value } });
  }

  function toggleTheme() {
    updatePref('theme', pref.theme === 'dark' ? 'light' : 'dark');
  }

  function handleExport() {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `beastmode90-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = importData(ev.target.result);
      if (result.success) {
        setImportSuccess(true);
        setImportError('');
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setImportError(result.error);
        setImportSuccess(false);
      }
    };
    reader.readAsText(file);
  }

  function handleClearAll() {
    clearAllData();
    setShowClear(false);
    window.location.reload();
  }

  function handleResetOnboarding() {
    updatePref('onboardingComplete', false);
    window.location.reload();
  }

  function startNewChallenge() {
    const active = state.challenges.find(c => c.status === 'active');
    if (active) {
      dispatch({ type: 'UPDATE_CHALLENGE', payload: { id: active.id, status: 'abandoned' } });
    }
    const habitIds = state.habits.filter(h => !h.archived).map(h => h.id);
    const challenge = createChallenge(newChallengeMode, habitIds);
    dispatch({ type: 'ADD_CHALLENGE', payload: challenge });
    setShowNewChallenge(false);
  }

  function completeChallenge() {
    if (!activeChallenge) return;
    const completed = { ...activeChallenge, status: 'completed', completedAt: new Date().toISOString() };
    dispatch({ type: 'UPDATE_CHALLENGE', payload: completed });
    setSelectedReportChallenge(completed);
  }

  const activeChallenge = state.challenges.find(c => c.status === 'active');

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Settings"
        subtitle="Manage your profile, system preferences, and transformation data"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-xl bg-lime-500/10 text-lime-400 flex items-center justify-center">
                <User size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Profile</h3>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">Your identity and measurement units</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label htmlFor="settings-profile-name" className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Full Name</label>
                <input
                  id="settings-profile-name"
                  value={profile.name || ''}
                  onChange={e => updateProfile('name', e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="settings-profile-height" className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Height</label>
                  <input
                    id="settings-profile-height"
                    value={profile.height || ''}
                    onChange={e => updateProfile('height', e.target.value)}
                    placeholder="e.g., 175"
                    type="number"
                  />
                </div>
                <div>
                  <label htmlFor="settings-profile-height-unit" className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Height Unit</label>
                  <select
                    id="settings-profile-height-unit"
                    value={profile.heightUnit || 'cm'}
                    onChange={e => updateProfile('heightUnit', e.target.value)}
                  >
                    <option value="cm">Centimeters (cm)</option>
                    <option value="ft">Feet & Inches (ft)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Preferences & Appearance */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.06]">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Palette size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Preferences</h3>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">Visual theme and regional settings</p>
              </div>
            </div>
            
            <div className="space-y-4">
              {/* Theme Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center text-[var(--color-text-secondary)]">
                    {pref.theme === 'dark' ? <Moon size={14} className="text-lime-400" /> : <Sun size={14} className="text-amber-400" />}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-[var(--color-text-primary)]">Appearance</p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)]">{pref.theme === 'dark' ? 'Liquid Dark' : 'Daylight'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={toggleTheme}
                  className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out relative ${
                    pref.theme === 'dark' ? 'bg-lime-500' : 'bg-white/20'
                  }`}
                  aria-label="Toggle theme"
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-black shadow-md transform transition-transform duration-200 ease-in-out flex items-center justify-center ${
                      pref.theme === 'dark' ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  >
                    {pref.theme === 'dark' ? <Moon size={10} className="text-lime-400" /> : <Sun size={10} className="text-white" />}
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="settings-pref-units" className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Weight & Distance</label>
                  <select id="settings-pref-units" value={pref.units || 'metric'} onChange={e => updatePref('units', e.target.value)}>
                    <option value="metric">Metric (kg, km)</option>
                    <option value="imperial">Imperial (lb, mi)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="settings-pref-weekstart" className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">First Day of Week</label>
                  <select id="settings-pref-weekstart" value={pref.weekStart || 'monday'} onChange={e => updatePref('weekStart', e.target.value)}>
                    <option value="monday">Monday</option>
                    <option value="sunday">Sunday</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Challenge Management */}
      <Card>
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Calendar size={16} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Transformation Challenge</h3>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">Current program status and historical audits</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setShowNewChallenge(true)}>
            Switch Challenge
          </Button>
        </div>

        {activeChallenge ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-lime-500/[0.04] border border-lime-500/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-lime-500/15 text-lime-400 flex items-center justify-center font-bold text-sm">
                  {activeChallenge.mode === 'beast' ? <Flame size={20} /> : <Zap size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-[var(--color-text-primary)]">
                      {CHALLENGE_MODES[activeChallenge.mode]?.name || 'Active Challenge'}
                    </h4>
                    <Badge color="var(--color-accent)">Active</Badge>
                  </div>
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                    Started on {activeChallenge.startDate}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelectedReportChallenge(activeChallenge)}>
                  <FileText size={14} /> View Transformation Report
                </Button>
              </div>
            </div>

            <Button
              size="sm"
              variant="secondary"
              className="w-full justify-center text-lime-400 border-lime-500/30 hover:bg-lime-500/10"
              onClick={completeChallenge}
            >
              <Trophy size={14} /> Complete Challenge & Generate Final Transformation Report
            </Button>
          </div>
        ) : (
          <div className="p-6 text-center rounded-xl bg-white/[0.02] border border-white/[0.06]">
            <p className="text-sm font-medium text-[var(--color-text-secondary)] mb-2">No active challenge running</p>
            <Button size="sm" onClick={() => setShowNewChallenge(true)}>
              Start a New Transformation
            </Button>
          </div>
        )}

        {/* Challenge History */}
        {state.challenges.filter(c => c.status !== 'active').length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider mb-2.5">
              Completed & Archived Challenges
            </p>
            <div className="space-y-2">
              {state.challenges.filter(c => c.status !== 'active').map(c => (
                <div
                  key={c.id}
                  onClick={() => setSelectedReportChallenge(c)}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.04] cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center text-xs text-[var(--color-text-secondary)]">
                      {c.mode === 'beast' ? <Flame size={14} className="text-orange-400" /> : <Zap size={14} className="text-lime-400" />}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-[var(--color-text-primary)] group-hover:text-lime-400 transition-colors">
                        {CHALLENGE_MODES[c.mode]?.name || c.name}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)]">
                        {c.startDate} → {c.endDate || 'Ended'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge color={c.status === 'completed' ? '#22c55e' : '#ef4444'}>
                      {c.status}
                    </Badge>
                    <ChevronRight size={14} className="text-[var(--color-text-tertiary)] group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Social & Privacy Card */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Shield size={16} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Social Privacy & Leaderboard Visibility</h3>
              <p className="text-[11px] text-[var(--color-text-tertiary)]">Control what is synced to cloud leaderboards</p>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => navigate('/social')}>
            Open Social Hub
          </Button>
        </div>
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
          <div className="pr-4">
            <p className="text-xs font-medium text-[var(--color-text-primary)]">Share Challenge Progress</p>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5 leading-relaxed">
              {pref.shareProgress
                ? 'Opted in — your consistency percentage, streak, and workout counts are visible to friends and leaderboards.'
                : 'Opted out — strictly private. Note: Nutrition food logs, body composition, and financial records are never shared.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => updatePref('shareProgress', !pref.shareProgress)}
            className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 ${
              pref.shareProgress ? 'bg-lime-500' : 'bg-white/20'
            }`}
            aria-label="Toggle progress sharing"
          >
            <div
              className={`w-5 h-5 rounded-full bg-black shadow-md transform transition-transform duration-200 ease-in-out ${
                pref.shareProgress ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </Card>

      {/* Data Management */}
      <Card>
        <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.06]">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Download size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Data Management</h3>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">Export backups, restore previous databases, or reset state</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="secondary" onClick={handleExport} className="justify-start h-auto py-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center mr-1">
              <Download size={14} />
            </div>
            <div className="text-left">
              <p className="text-xs font-medium text-[var(--color-text-primary)]">Export JSON Backup</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">Download your complete database</p>
            </div>
          </Button>

          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="justify-start h-auto py-2.5">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mr-1">
              <Upload size={14} />
            </div>
            <div className="text-left">
              <p className="text-xs font-medium text-[var(--color-text-primary)]">Import JSON Backup</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">Restore previous snapshot</p>
            </div>
          </Button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />

          <Button variant="secondary" onClick={handleResetOnboarding} className="justify-start h-auto py-2.5">
            <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center mr-1">
              <RotateCcw size={14} />
            </div>
            <div className="text-left">
              <p className="text-xs font-medium text-[var(--color-text-primary)]">Reset Onboarding Flow</p>
              <p className="text-[10px] text-[var(--color-text-tertiary)]">Rerun the initial setup wizard</p>
            </div>
          </Button>

          <Button variant="danger" onClick={() => setShowClear(true)} className="justify-start h-auto py-2.5 border border-red-500/30">
            <div className="w-7 h-7 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center mr-1">
              <Trash2 size={14} />
            </div>
            <div className="text-left">
              <p className="text-xs font-medium text-red-400">Clear All Local Data</p>
              <p className="text-[10px] text-red-400/70">Wipe habits, workouts & logs</p>
            </div>
          </Button>
        </div>

        {importSuccess && (
          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
            <Check size={14} /> Import successful! Refreshing application...
          </div>
        )}
        {importError && (
          <div className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
            <AlertTriangle size={14} /> {importError}
          </div>
        )}
      </Card>

      {/* Clear Confirmation Modal */}
      <Modal isOpen={showClear} onClose={() => setShowClear(false)} title="Clear All Local Data">
        <div className="text-center py-2">
          <div className="w-12 h-12 rounded-2xl bg-red-500/15 text-red-400 flex items-center justify-center mx-auto mb-3">
            <AlertTriangle size={24} />
          </div>
          <h4 className="font-bold text-base text-[var(--color-text-primary)] mb-1">Are you absolutely sure?</h4>
          <p className="text-xs text-[var(--color-text-secondary)] mb-6 max-w-sm mx-auto leading-relaxed">
            This will permanently delete all your habits, completed sets, food logs, journal reflections, and personal records. This action cannot be undone.
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setShowClear(false)} className="flex-1">
              Cancel
            </Button>
            <Button variant="danger" onClick={handleClearAll} className="flex-1">
              Delete Everything
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Challenge Modal */}
      <Modal isOpen={showNewChallenge} onClose={() => setShowNewChallenge(false)} title="Select Transformation Mode">
        <div className="space-y-3 mb-5">
          {activeChallenge && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
              <AlertTriangle size={14} className="shrink-0" />
              <span>Your current active challenge ({CHALLENGE_MODES[activeChallenge.mode]?.name}) will be archived as abandoned.</span>
            </div>
          )}
          {Object.values(CHALLENGE_MODES).map(mode => {
            const isSelected = newChallengeMode === mode.key;
            return (
              <div
                key={mode.key}
                onClick={() => setNewChallengeMode(mode.key)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-lime-500/10 border-lime-500 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]'
                    : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-lg">
                      {mode.key === 'beast' ? <Flame size={18} className="text-orange-400" /> : <Zap size={18} className="text-lime-400" />}
                    </div>
                    <div>
                      <p className="font-semibold text-xs text-[var(--color-text-primary)]">{mode.name}</p>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">{mode.tagline}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {mode.duration && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] text-[var(--color-text-tertiary)]">
                        {mode.duration}d
                      </span>
                    )}
                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                      isSelected ? 'bg-lime-500 border-lime-500 text-black' : 'border-white/20'
                    }`}>
                      {isSelected && <Check size={12} strokeWidth={3} />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <Button onClick={startNewChallenge} className="w-full">
          Launch {CHALLENGE_MODES[newChallengeMode]?.name}
        </Button>
      </Modal>

      {/* Transformation Report Modal */}
      {selectedReportChallenge && (
        <TransformationReportModal
          isOpen={Boolean(selectedReportChallenge)}
          onClose={() => setSelectedReportChallenge(null)}
          challenge={selectedReportChallenge}
          state={state}
          onStartNew={() => {
            setSelectedReportChallenge(null);
            setShowNewChallenge(true);
          }}
        />
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { Modal, Button, Badge, ProgressRing, Card } from '../ui';
import { generateTransformationReport, CHALLENGE_MODES } from '../../utils/challenge';
import { Trophy, Flame, Dumbbell, BookOpen, Brain, Droplets, Wallet, Calendar, CheckCircle, Award, Share2, Sparkles } from 'lucide-react';

export default function TransformationReportModal({ isOpen, onClose, challenge, state, onStartNew }) {
  const report = useMemo(() => {
    if (!challenge) return null;
    return generateTransformationReport(challenge, state);
  }, [challenge, state]);

  if (!report) return null;

  const modeConfig = CHALLENGE_MODES[challenge.mode] || CHALLENGE_MODES.beast;

  function copySummary() {
    const text = `🏆 BEASTMODE 90 TRANSFORMATION REPORT
Challenge: ${report.challengeName} (${report.daysTracked} days)
Consistency: ${report.habitRate}% (${report.totalHabitsCompleted} habits done)
Training: ${report.workoutCount} workouts · ${report.totalVolume.toLocaleString()} volume lifted
Learning: ${report.learningHours} hours
Hydration: ${(report.totalWater / 1000).toFixed(1)}L water
Net Savings: $${report.netSavings.toLocaleString()}
Built with Beastmode 90`;
    navigator.clipboard?.writeText(text);
    alert('Transformation summary copied to clipboard!');
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Transformation Report" maxWidth="max-w-2xl">
      <div className="space-y-6">
        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-2xl p-6 bg-gradient-to-b from-white/[0.06] to-white/[0.02] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] text-center">
          <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-lime-500/15 border border-lime-500/30 flex items-center justify-center text-lime-400 shadow-[0_0_24px_rgba(132,204,22,0.25)]">
            <Trophy size={32} />
          </div>
          <Badge color={modeConfig.color} className="mb-2">
            {report.challengeName}
          </Badge>
          <h2 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)]">
            Personal Transformation Summary
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            {report.startDate} to {report.endDate} · {report.daysTracked} Days of Dedication
          </p>

          <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/[0.06]">
            <div>
              <p className="text-2xl font-black text-lime-400 font-mono">{report.habitRate}%</p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Discipline Rate</p>
            </div>
            <div>
              <p className="text-2xl font-black text-rose-400 font-mono">{report.workoutCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Workouts Logged</p>
            </div>
            <div>
              <p className="text-2xl font-black text-blue-400 font-mono">{report.learningHours}h</p>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Knowledge Built</p>
            </div>
          </div>
        </div>

        {/* Milestone Badges */}
        {report.milestones.length > 0 && (
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-[var(--color-text-primary)]">
              <Award size={16} className="text-lime-400" />
              Phase Milestones
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {report.milestones.map((ms, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-xl border transition-all ${
                    ms.achieved
                      ? 'bg-lime-500/[0.08] border-lime-500/30 text-[var(--color-text-primary)] shadow-[inset_0_1px_0_0_rgba(132,204,22,0.1)]'
                      : 'bg-white/[0.02] border-white/[0.05] opacity-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold text-lime-400">Day {ms.day}</span>
                    {ms.achieved && <CheckCircle size={14} className="text-lime-400" />}
                  </div>
                  <p className="text-xs font-semibold">{ms.title}</p>
                  <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">{ms.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Domain Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Card className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-400 shrink-0">
              <Flame size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">{report.totalHabitsCompleted}</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">Habits Checked</p>
            </div>
          </Card>

          <Card className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-400 shrink-0">
              <Dumbbell size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">{report.totalVolume.toLocaleString()}</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">Volume Lifted</p>
            </div>
          </Card>

          <Card className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center text-blue-400 shrink-0">
              <Droplets size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">{(report.totalWater / 1000).toFixed(1)}L</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">Hydration Logged</p>
            </div>
          </Card>

          <Card className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 shrink-0">
              <Brain size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">{report.avgMood ? `${report.avgMood}/5` : '—'}</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">Avg Mind Mood</p>
            </div>
          </Card>

          <Card className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
              <Calendar size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">{report.avgSleep ? `${report.avgSleep}h` : '—'}</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">Avg Sleep</p>
            </div>
          </Card>

          <Card className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center text-cyan-400 shrink-0">
              <Wallet size={18} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold font-mono text-[var(--color-text-primary)]">${report.netSavings.toLocaleString()}</p>
              <p className="text-xs text-[var(--color-text-secondary)] truncate">Net Saved</p>
            </div>
          </Card>
        </div>

        {/* Weight change if tracked */}
        {report.startWeight !== null && (
          <Card className="flex items-center justify-between">
            <div>
              <p className="text-xs text-[var(--color-text-tertiary)] uppercase font-semibold">Body Composition</p>
              <p className="text-sm font-medium mt-0.5">
                Starting: {report.startWeight} → Current: {report.endWeight}
              </p>
            </div>
            {report.weightChange !== null && (
              <Badge color={report.weightChange < 0 ? '#22c55e' : 'var(--color-accent)'}>
                {report.weightChange > 0 ? `+${report.weightChange}` : report.weightChange}
              </Badge>
            )}
          </Card>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Button variant="secondary" onClick={copySummary} className="flex-1">
            <Share2 size={16} /> Copy Summary
          </Button>
          {onStartNew && (
            <Button onClick={onStartNew} className="flex-1">
              Graduate & Start New
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

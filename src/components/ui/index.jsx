import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export function Card({ children, className = '', onClick, hover = true, ...props }) {
  return (
    <div
      className={`relative bg-[var(--color-bg-card)] backdrop-blur-xl border border-[var(--color-border-primary)] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_4px_24px_-4px_rgba(0,0,0,0.45)] rounded-2xl p-4 sm:p-5 transition-all duration-300 ${
        onClick
          ? 'cursor-pointer hover:border-[var(--color-border-hover)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12),0_8px_32px_-4px_rgba(0,0,0,0.6)] active:scale-[0.99]'
          : hover ? 'hover:border-[var(--color-border-hover)]' : ''
      } ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function GlassCard({ children, className = '', onClick, ...props }) {
  return (
    <div
      className={`relative bg-white/[0.035] backdrop-blur-2xl border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_8px_32px_-6px_rgba(0,0,0,0.5)] rounded-2xl p-4 sm:p-5 transition-all duration-300 ${
        onClick ? 'cursor-pointer hover:border-white/[0.18] hover:bg-white/[0.05] active:scale-[0.99]' : ''
      } ${className}`}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className = '',
  disabled,
  ...props
}) {
  const base =
    'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-200 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg-primary)]';

  const variants = {
    primary:
      'bg-[var(--color-accent)] text-black hover:bg-[var(--color-accent-hover)] shadow-[0_2px_12px_rgba(132,204,22,0.25)] hover:shadow-[0_4px_20px_rgba(132,204,22,0.38)] active:scale-[0.97]',
    secondary:
      'bg-white/[0.05] backdrop-blur-md text-[var(--color-text-primary)] border border-white/[0.09] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] hover:bg-white/[0.09] hover:border-white/[0.18] active:scale-[0.97]',
    ghost:
      'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.06] active:scale-[0.97]',
    danger:
      'bg-rose-500/15 text-rose-400 border border-rose-500/20 hover:bg-rose-500/25 active:scale-[0.97]',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 min-h-[34px]',
    md: 'text-sm px-4 py-2.5 gap-2 min-h-[42px]',
    lg: 'text-base px-6 py-3 gap-2.5 min-h-[48px]',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${
        disabled ? 'opacity-40 pointer-events-none cursor-not-allowed' : ''
      } ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

export function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          {/* Glass backdrop */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal floating card */}
          <motion.div
            className={`relative bg-[#131317]/95 backdrop-blur-2xl border border-white/[0.1] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8),inset_0_1px_0_0_rgba(255,255,255,0.12)] rounded-3xl w-full ${maxWidth} max-h-[88vh] flex flex-col my-auto overflow-hidden`}
            initial={{ scale: 0.96, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            role="dialog"
            aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08] shrink-0 bg-white/[0.02]">
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-[var(--color-text-primary)]">
                {title}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/[0.05] hover:bg-white/[0.1] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-all"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ProgressRing({
  percent = 0,
  size = 80,
  strokeWidth = 6,
  color = 'var(--color-accent)',
  children,
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clampedPercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const offset = c - (clampedPercent / 100) * c;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center select-none">
        {children}
      </div>
    </div>
  );
}

export function Badge({ children, color = 'var(--color-accent)', className = '' }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide border ${className}`}
      style={{
        background: `${color}18`,
        color: color,
        borderColor: `${color}33`,
      }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
      {Icon && (
        <div className="w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/[0.08] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] flex items-center justify-center mb-4 text-[var(--color-accent)]">
          <Icon size={24} strokeWidth={1.8} />
        </div>
      )}
      <h3 className="text-base font-bold text-[var(--color-text-primary)] mb-1">{title}</h3>
      <p className="text-sm text-[var(--color-text-secondary)] max-w-sm mb-5 leading-relaxed">
        {description}
      </p>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] mt-1 font-normal leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
  );
}

export function TabBar({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 p-1 bg-white/[0.035] backdrop-blur-md border border-white/[0.06] rounded-2xl mb-6 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all duration-200 ${
              isActive
                ? 'bg-white/[0.12] text-white shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_0_rgba(255,255,255,0.18)]'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.04]'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatCard({ title, value, subtitle, icon: Icon, color = 'var(--color-accent)', trend }) {
  return (
    <Card className="flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          {title}
        </span>
        {Icon && (
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: `${color}18`, color }}
          >
            <Icon size={16} strokeWidth={2} />
          </div>
        )}
      </div>
      <div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-[var(--color-text-primary)] tracking-tight">
            {value}
          </span>
          {trend && (
            <span
              className={`text-xs font-semibold ${
                trend > 0 ? 'text-[var(--color-accent)]' : trend < 0 ? 'text-rose-400' : 'text-slate-400'
              }`}
            >
              {trend > 0 ? `+${trend}%` : `${trend}%`}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{subtitle}</p>
        )}
      </div>
    </Card>
  );
}

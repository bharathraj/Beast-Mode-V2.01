import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  Home,
  ListChecks,
  Dumbbell,
  Utensils,
  LayoutGrid,
  BarChart3,
  Trophy,
  Brain,
  BookOpen,
  Wallet,
  CalendarCheck,
  Settings,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const mainTabs = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/habits', label: 'Habits', icon: ListChecks },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/nutrition', label: 'Nutrition', icon: Utensils },
];

const moreModules = [
  { to: '/insights', label: 'Insights', icon: BarChart3, desc: 'Analytics & Trends' },
  { to: '/social', label: 'Ranks & Social', icon: Trophy, desc: 'Leaderboard & Squad' },
  { to: '/mind', label: 'Mind & Mood', icon: Brain, desc: 'Meditation & Journal' },
  { to: '/learning', label: 'Learning', icon: BookOpen, desc: 'Study & Skill Targets' },
  { to: '/money', label: 'Money', icon: Wallet, desc: 'Finances & Savings' },
  { to: '/review', label: 'Weekly Review', icon: CalendarCheck, desc: 'Retrospectives' },
  { to: '/settings', label: 'Settings', icon: Settings, desc: 'Preferences & Backup' },
];

export default function BottomNav() {
  const [showMore, setShowMore] = useState(false);
  const location = useLocation();

  const isMoreActive = moreModules.some((m) => m.to === location.pathname);

  return (
    <>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[var(--color-bg-secondary)]/95 backdrop-blur-2xl border-t border-[var(--color-border-primary)] shadow-[0_-8px_32px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-around px-2 py-2 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          {mainTabs.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 py-1 rounded-xl transition-all duration-200 select-none ${
                  isActive
                    ? 'text-[var(--color-accent)] font-semibold'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={`transition-transform ${isActive ? 'scale-110 drop-shadow-[0_2px_8px_rgba(132,204,22,0.4)]' : ''}`}
                  />
                  <span className="text-[10px] mt-1 tracking-tight">{label}</span>
                </>
              )}
            </NavLink>
          ))}

          {/* More trigger */}
          <button
            onClick={() => setShowMore(true)}
            aria-label="Open More modules"
            className={`flex flex-col items-center justify-center min-w-[54px] min-h-[44px] px-2 py-1 rounded-xl transition-all duration-200 select-none ${
              isMoreActive || showMore
                ? 'text-[var(--color-accent)] font-semibold'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            <LayoutGrid
              size={20}
              strokeWidth={isMoreActive || showMore ? 2.2 : 1.8}
              className={`transition-transform ${isMoreActive || showMore ? 'scale-110 drop-shadow-[0_2px_8px_rgba(132,204,22,0.4)]' : ''}`}
            />
            <span className="text-[10px] mt-1 tracking-tight">More</span>
          </button>
        </div>
      </nav>

      {/* iOS style Liquid Glass slide-up sheet for "More" */}
      <AnimatePresence>
        {showMore && (
          <div className="md:hidden fixed inset-0 z-[60] flex flex-col justify-end">
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMore(false)}
            />

            <motion.div
              className="relative bg-[var(--color-bg-secondary)]/98 backdrop-blur-2xl border-t border-[var(--color-border-primary)] rounded-t-3xl shadow-[0_-16px_48px_rgba(0,0,0,0.3)] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] max-h-[80vh] overflow-y-auto"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 350 }}
            >
              {/* Sheet handle */}
              <div className="w-10 h-1 rounded-full bg-[var(--color-border-hover)] mx-auto mb-4" />

              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-[var(--color-text-primary)]">
                  More Features
                </h3>
                <button
                  onClick={() => setShowMore(false)}
                  className="w-8 h-8 rounded-full bg-[var(--color-bg-hover)] flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2">
                {moreModules.map(({ to, label, icon: Icon, desc }) => {
                  const isActive = location.pathname === to;
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={() => setShowMore(false)}
                      className={`flex items-center gap-3.5 p-3 rounded-2xl border transition-all ${
                        isActive
                          ? 'bg-[var(--color-accent-dim)] border-[var(--color-accent)]/30 text-[var(--color-accent)]'
                          : 'bg-[var(--color-bg-card)] border-[var(--color-border-primary)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]'
                      }`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          isActive
                            ? 'bg-[var(--color-accent)] text-black'
                            : 'bg-white/[0.06] text-[var(--color-text-secondary)]'
                        }`}
                      >
                        <Icon size={18} strokeWidth={2} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm leading-tight">{label}</p>
                        <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">{desc}</p>
                      </div>
                    </NavLink>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

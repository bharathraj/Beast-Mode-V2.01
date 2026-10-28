import { NavLink } from 'react-router-dom';
import {
  Home,
  ListChecks,
  Dumbbell,
  Utensils,
  BarChart3,
  Trophy,
  Brain,
  BookOpen,
  Wallet,
  CalendarCheck,
  Settings,
  Sparkles,
} from 'lucide-react';

const primaryNav = [
  { to: '/', label: 'Home', icon: Home },
  { to: '/habits', label: 'Habits', icon: ListChecks },
  { to: '/train', label: 'Train', icon: Dumbbell },
  { to: '/nutrition', label: 'Nutrition', icon: Utensils },
  { to: '/social', label: 'Social & Ranks', icon: Trophy },
  { to: '/insights', label: 'Insights', icon: BarChart3 },
];

const secondaryNav = [
  { to: '/mind', label: 'Mind', icon: Brain },
  { to: '/learning', label: 'Learning', icon: BookOpen },
  { to: '/money', label: 'Money', icon: Wallet },
  { to: '/review', label: 'Review', icon: CalendarCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function NavItem({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 ${
          isActive
            ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)] border border-[var(--color-accent)]/25 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1),0_2px_8px_rgba(132,204,22,0.12)]'
            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-white/[0.05] border border-transparent'
        }`
      }
    >
      <Icon size={17} strokeWidth={1.9} className="shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden md:flex flex-col w-64 h-screen fixed left-0 top-0 bg-[#0f0f13]/90 backdrop-blur-2xl border-r border-white/[0.08] shadow-[1px_0_24px_rgba(0,0,0,0.5)] z-40">
      {/* Brand Header */}
      <div className="px-6 py-5 border-b border-white/[0.08]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-[#65a30d] flex items-center justify-center text-black font-black text-sm shadow-[0_2px_12px_rgba(132,204,22,0.35)] ring-1 ring-white/20">
            B
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black tracking-tight text-[var(--color-text-primary)] leading-tight flex items-center gap-1.5">
              BEASTMODE
              <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded-md bg-[var(--color-accent-dim)] text-[var(--color-accent)] border border-[var(--color-accent)]/30">
                90
              </span>
            </h1>
            <p className="text-[10px] font-medium text-[var(--color-text-tertiary)] tracking-wider uppercase mt-0.5">
              High Performance Life
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 px-3.5 py-5 space-y-1 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] font-bold tracking-widest uppercase text-[var(--color-text-tertiary)]">
          Core Pillars
        </p>
        {primaryNav.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}

        <div className="my-5 border-t border-white/[0.08]" />

        <p className="px-3 mb-2 text-[10px] font-bold tracking-widest uppercase text-[var(--color-text-tertiary)]">
          Growth & System
        </p>
        {secondaryNav.map((item) => (
          <NavItem key={item.to} {...item} />
        ))}
      </nav>

      {/* Footer Status Pill */}
      <div className="p-4 border-t border-white/[0.08] bg-white/[0.015]">
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse" />
            <span className="text-xs font-semibold text-[var(--color-text-secondary)]">Active Discipline</span>
          </div>
          <Sparkles size={13} className="text-[var(--color-accent)]" />
        </div>
      </div>
    </aside>
  );
}

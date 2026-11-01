import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { StoreProvider, useStore } from './store/StoreContext';
import Sidebar from './components/layout/Sidebar';
import BottomNav from './components/layout/BottomNav';

// Route-based lazy loading with dynamic imports
const HomePage = lazy(() => import('./pages/HomePage'));
const HabitsPage = lazy(() => import('./pages/HabitsPage'));
const TrainPage = lazy(() => import('./pages/TrainPage'));
const NutritionPage = lazy(() => import('./pages/NutritionPage'));
const SocialPage = lazy(() => import('./pages/SocialPage'));
const InsightsPage = lazy(() => import('./pages/InsightsPage'));
const MindPage = lazy(() => import('./pages/MindPage'));
const LearningPage = lazy(() => import('./pages/LearningPage'));
const MoneyPage = lazy(() => import('./pages/MoneyPage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const Onboarding = lazy(() => import('./components/onboarding/Onboarding'));

export function PageLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-6 max-w-5xl mx-auto animate-pulse py-4"
    >
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded-2xl bg-white/[0.06] border border-white/[0.04]" />
          <div className="h-4 w-72 rounded-xl bg-white/[0.03]" />
        </div>
        <div className="h-9 w-28 rounded-xl bg-white/[0.04]" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-24 rounded-2xl bg-white/[0.03] border border-white/[0.05] p-4 flex flex-col justify-between"
          >
            <div className="h-4 w-16 rounded-lg bg-white/[0.05]" />
            <div className="h-6 w-20 rounded-lg bg-white/[0.08]" />
          </div>
        ))}
      </div>

      {/* Main card skeleton */}
      <div className="h-64 rounded-3xl bg-white/[0.025] border border-white/[0.05] p-6 flex flex-col justify-between">
        <div className="h-5 w-40 rounded-xl bg-white/[0.05]" />
        <div className="space-y-3">
          <div className="h-3 w-full rounded-full bg-white/[0.03]" />
          <div className="h-3 w-5/6 rounded-full bg-white/[0.03]" />
          <div className="h-3 w-2/3 rounded-full bg-white/[0.03]" />
        </div>
        <div className="h-9 w-32 rounded-xl bg-[var(--color-accent-dim)] self-end" />
      </div>
      <span className="sr-only">Loading page content...</span>
    </div>
  );
}

function AppShell() {
  const { state } = useStore();

  if (!state.preferences.onboardingComplete) {
    return (
      <Suspense fallback={<PageLoadingFallback />}>
        <Onboarding />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Sidebar />
      <main className="md:ml-64 min-h-screen pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
          <Suspense fallback={<PageLoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/habits" element={<HabitsPage />} />
              <Route path="/train" element={<TrainPage />} />
              <Route path="/nutrition" element={<NutritionPage />} />
              <Route path="/social" element={<SocialPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/mind" element={<MindPage />} />
              <Route path="/learning" element={<LearningPage />} />
              <Route path="/money" element={<MoneyPage />} />
              <Route path="/review" element={<ReviewPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Suspense>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppShell />
    </StoreProvider>
  );
}

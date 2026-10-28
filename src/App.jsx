import { Routes, Route } from 'react-router-dom';
import { StoreProvider, useStore } from './store/StoreContext';
import Sidebar from './components/layout/Sidebar';
import BottomNav from './components/layout/BottomNav';
import Onboarding from './components/onboarding/Onboarding';
import HomePage from './pages/HomePage';
import HabitsPage from './pages/HabitsPage';
import TrainPage from './pages/TrainPage';
import NutritionPage from './pages/NutritionPage';
import MindPage from './pages/MindPage';
import LearningPage from './pages/LearningPage';
import MoneyPage from './pages/MoneyPage';
import InsightsPage from './pages/InsightsPage';
import ReviewPage from './pages/ReviewPage';
import SettingsPage from './pages/SettingsPage';
import SocialPage from './pages/SocialPage';

function AppShell() {
  const { state } = useStore();

  if (!state.preferences.onboardingComplete) {
    return <Onboarding />;
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <Sidebar />
      <main className="md:ml-64 min-h-screen pb-24 md:pb-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8">
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

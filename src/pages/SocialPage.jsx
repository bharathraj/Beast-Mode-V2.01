import { useState, useEffect, useMemo } from 'react';
import { useStore } from '../store/StoreContext';
import { Card, Button, Modal, PageHeader, TabBar, Badge } from '../components/ui';
import {
  isSupabaseConfigured,
  getCurrentUser,
  signInUser,
  signUpUser,
  signOutUser,
  updatePrivacyPreferences,
  getFriendsList,
  sendFriendInvitation,
  respondFriendInvitation,
  getPrivateGroups,
  createPrivateGroup,
  joinGroupByCode,
  getLeaderboardRankings,
  syncUserChallengeStats,
} from '../services/supabase';
import { getChallengeProgress, getStreak, CHALLENGE_MODES } from '../utils/challenge';
import { todayStr } from '../utils/storage';
import {
  Users, Trophy, Shield, UserPlus, LogIn, LogOut,
  Flame, Dumbbell, CheckCircle2, AlertCircle, RefreshCw,
  ExternalLink, Lock, Globe, Key, UserCheck, Copy, Check, Plus,
  Sparkles, Award, ArrowUpRight
} from 'lucide-react';

export default function SocialPage() {
  const { state, dispatch } = useStore();
  const [subTab, setSubTab] = useState('leaderboard'); // 'leaderboard' | 'friends' | 'groups' | 'privacy'

  // User auth state
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authDisplayName, setAuthDisplayName] = useState('');
  const [authError, setAuthError] = useState('');

  // Leaderboard state
  const [leaderboardMode, setLeaderboardMode] = useState('beast');
  const [leaderboardScope, setLeaderboardScope] = useState('global'); // 'global' | 'friends'
  const [rankings, setRankings] = useState([]);
  const [syncingStats, setSyncingStats] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');

  // Friends state
  const [friends, setFriends] = useState([]);
  const [friendInput, setFriendInput] = useState('');
  const [friendActionMsg, setFriendActionMsg] = useState('');
  const [sendingInvite, setSendingInvite] = useState(false);

  // Groups state
  const [groups, setGroups] = useState([]);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [groupActionMsg, setGroupActionMsg] = useState('');
  const [copiedCode, setCopiedCode] = useState('');

  // Active challenge and verified score calculation
  const activeChallenge = useMemo(() => {
    return state.challenges.find(c => c.status === 'active');
  }, [state.challenges]);

  const verifiedStats = useMemo(() => {
    if (!activeChallenge) {
      return { consistencyPercent: 0, currentStreak: 0, workoutsCompleted: 0, challengeDay: 0 };
    }

    const progress = getChallengeProgress(activeChallenge);
    const scheduledHabits = state.habits.filter(h => !h.archived);

    // Calculate verified completions
    const start = activeChallenge.startDate;
    const end = todayStr();
    const relevantCompletions = (state.habitCompletions || []).filter(c => c.date >= start && c.date <= end);

    const activeDays = Math.max(1, progress.day);
    const totalScheduledSlots = Math.max(1, scheduledHabits.length * activeDays);
    const verifiedCompletions = relevantCompletions.length;
    const consistency = Math.min(100, Math.round((verifiedCompletions / totalScheduledSlots) * 100));

    // Calculate streak
    let maxStreak = 0;
    for (const h of scheduledHabits) {
      const s = getStreak(h.id, state.habitCompletions);
      if (s.current > maxStreak) maxStreak = s.current;
    }

    // Workouts completed during active challenge
    const workouts = (state.workoutSessions || []).filter(w => w.date >= start && w.date <= end).length;

    return {
      consistencyPercent: consistency,
      currentStreak: maxStreak,
      workoutsCompleted: workouts,
      challengeDay: progress.day,
    };
  }, [activeChallenge, state.habits, state.habitCompletions, state.workoutSessions]);

  // Load auth user
  useEffect(() => {
    async function loadAuth() {
      try {
        const u = await getCurrentUser();
        setUser(u);
      } catch (err) {
        console.warn('Error loading auth user:', err);
      } finally {
        setLoadingAuth(false);
      }
    }
    loadAuth();
  }, []);

  // Load rankings
  useEffect(() => {
    async function loadRankings() {
      const data = await getLeaderboardRankings(leaderboardMode, leaderboardScope);
      setRankings(data);
    }
    loadRankings();
  }, [leaderboardMode, leaderboardScope]);

  // Load friends and groups
  useEffect(() => {
    async function loadSocial() {
      const f = await getFriendsList();
      setFriends(f);
      const g = await getPrivateGroups();
      setGroups(g);
    }
    loadSocial();
  }, []);

  // Sync verified user stats to leaderboard
  async function handleSyncVerifiedStats() {
    if (!activeChallenge) {
      setSyncMessage('No active challenge found to rank on leaderboards.');
      return;
    }

    setSyncingStats(true);
    setSyncMessage('');

    try {
      const isOptedIn = Boolean(state.preferences.shareProgress);
      if (!isOptedIn) {
        setSyncMessage('Progress sharing is currently private. Enable "Share Challenge Progress" below to rank.');
        setSyncingStats(false);
        return;
      }

      await syncUserChallengeStats(
        activeChallenge,
        verifiedStats,
        state.profile.name || user?.user_metadata?.name || 'You',
        isOptedIn
      );

      const refreshed = await getLeaderboardRankings(leaderboardMode, leaderboardScope);
      setRankings(refreshed);
      setSyncMessage('Successfully synchronized your verified stats to leaderboard!');
    } catch (err) {
      setSyncMessage(`Sync error: ${err.message}`);
    } finally {
      setSyncingStats(false);
    }
  }

  // Auth submission
  async function handleAuthSubmit() {
    setAuthError('');
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('Please enter both email and password.');
      return;
    }

    try {
      if (authMode === 'signup') {
        const newUser = await signUpUser(authEmail.trim(), authPassword, authDisplayName.trim());
        setUser(newUser);
        setShowAuthModal(false);
      } else {
        const loggedUser = await signInUser(authEmail.trim(), authPassword);
        setUser(loggedUser);
        setShowAuthModal(false);
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed. Please verify credentials.');
    }
  }

  async function handleSignOut() {
    await signOutUser();
    setUser(null);
  }

  // Toggle opt-in sharing
  async function handleToggleProgressSharing() {
    const nextVal = !state.preferences.shareProgress;
    dispatch({
      type: 'SET_PREFERENCES',
      payload: { shareProgress: nextVal },
    });

    await updatePrivacyPreferences(nextVal);

    if (nextVal && activeChallenge) {
      syncUserChallengeStats(
        activeChallenge,
        verifiedStats,
        state.profile.name || user?.user_metadata?.name || 'You',
        true
      );
    }
  }

  // Send friend invitation
  async function handleSendFriendInvite() {
    if (!friendInput.trim()) return;
    setSendingInvite(true);
    setFriendActionMsg('');
    try {
      const res = await sendFriendInvitation(friendInput);
      setFriendActionMsg(res.message);
      setFriendInput('');
      const updated = await getFriendsList();
      setFriends(updated);
    } catch (err) {
      setFriendActionMsg(`Error: ${err.message}`);
    } finally {
      setSendingInvite(false);
    }
  }

  // Accept/Decline friend
  async function handleRespondInvite(id, accept) {
    await respondFriendInvitation(id, accept);
    const updated = await getFriendsList();
    setFriends(updated);
  }

  // Create group
  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    try {
      const created = await createPrivateGroup(newGroupName, newGroupDesc);
      setShowCreateGroupModal(false);
      setNewGroupName('');
      setNewGroupDesc('');
      const updated = await getPrivateGroups();
      setGroups(updated);
      setGroupActionMsg(`Group "${created.name}" created with code: ${created.code}`);
    } catch (err) {
      setGroupActionMsg(`Error: ${err.message}`);
    }
  }

  // Join group by code
  async function handleJoinGroup() {
    if (!joinCodeInput.trim()) return;
    try {
      const joined = await joinGroupByCode(joinCodeInput);
      setJoinCodeInput('');
      const updated = await getPrivateGroups();
      setGroups(updated);
      setGroupActionMsg(`Successfully joined group "${joined.name}"!`);
    } catch (err) {
      setGroupActionMsg(`Error: ${err.message}`);
    }
  }

  function handleCopy(code) {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(''), 2000);
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Social & Leaderboards"
        subtitle="Compete with peers, join private accountability groups, and climb verified rankings"
        action={
          user ? (
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-[var(--color-text-secondary)]">
                {user.user_metadata?.name || user.email}
              </span>
              <Button size="sm" variant="ghost" onClick={handleSignOut}>
                <LogOut size={14} /> Sign Out
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => { setAuthMode('login'); setShowAuthModal(true); }}>
              <LogIn size={14} /> Sign In with Supabase
            </Button>
          )
        }
      />

      {/* Backend Status Notification */}
      <div className="flex items-center justify-between px-4 py-2.5 rounded-2xl bg-white/[0.025] backdrop-blur-md border border-white/[0.06] text-xs">
        <div className="flex items-center gap-2.5">
          <div className={`w-2 h-2 rounded-full ${isSupabaseConfigured ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]' : 'bg-amber-400'}`} />
          <span className="text-[var(--color-text-secondary)] font-normal">
            {isSupabaseConfigured
              ? 'Connected to Supabase PostgreSQL Database (Cloud Sync Active)'
              : 'Local Demo Store (Configure VITE_SUPABASE_URL in .env for Cloud Sync)'}
          </span>
        </div>
        <span className="text-[10px] text-[var(--color-text-tertiary)] uppercase font-mono tracking-wider">
          {isSupabaseConfigured ? 'Supabase Live' : 'Demo Mode'}
        </span>
      </div>

      <TabBar
        tabs={[
          { key: 'leaderboard', label: 'Leaderboards' },
          { key: 'friends', label: 'Friends' },
          { key: 'groups', label: 'Squad Groups' },
          { key: 'privacy', label: 'Privacy & Opt-In' },
        ]}
        active={subTab}
        onChange={setSubTab}
      />

      {/* SUBTAB: LEADERBOARD */}
      {subTab === 'leaderboard' && (
        <div className="space-y-5">
          {/* Explicit Ranking Rules Banner */}
          <Card className="bg-white/[0.02] border-white/[0.06]">
            <div className="flex items-start gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                <Trophy size={18} />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm text-[var(--color-text-primary)]">
                  Deterministic Server-Side Ranking Rules
                </h4>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  Leaderboard standings are calculated directly from verified habit completions and logged workout sessions. Arbitrary score submissions are blocked.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <span className="font-bold text-lime-400 block mb-0.5">1. Consistency %</span>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">Scheduled habits completed in challenge window.</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <span className="font-bold text-orange-400 block mb-0.5">2. Consecutive Streak</span>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">Unbroken daily execution count.</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.04]">
                    <span className="font-bold text-rose-400 block mb-0.5">3. Workouts Logged</span>
                    <span className="text-[11px] text-[var(--color-text-tertiary)]">Total verified training sessions logged.</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* User's Verified Performance Card */}
          <Card className="bg-lime-500/[0.05] border-lime-500/20 shadow-[inset_0_1px_0_0_rgba(132,204,22,0.1)]">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold text-lime-400 uppercase tracking-wider">
                  Your Verified Challenge Standing
                </p>
                <h3 className="text-base font-bold text-[var(--color-text-primary)] mt-0.5">
                  {activeChallenge ? activeChallenge.name : 'No Active Challenge'}
                </h3>
                <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-[var(--color-text-secondary)]">
                  <span>Consistency: <strong className="text-lime-400 font-mono">{verifiedStats.consistencyPercent}%</strong></span>
                  <span>Streak: <strong className="text-orange-400 font-mono">{verifiedStats.currentStreak}d</strong></span>
                  <span>Workouts: <strong className="text-rose-400 font-mono">{verifiedStats.workoutsCompleted}</strong></span>
                  <span>Day: <strong className="text-[var(--color-text-primary)] font-mono">{verifiedStats.challengeDay}</strong></span>
                </div>
              </div>

              <Button size="sm" onClick={handleSyncVerifiedStats} disabled={syncingStats} className="shrink-0">
                <RefreshCw size={14} className={syncingStats ? 'animate-spin' : ''} />
                Sync to Leaderboard
              </Button>
            </div>
            {syncMessage && (
              <p className="text-xs text-lime-400 font-medium mt-3 pt-3 border-t border-lime-500/15">
                {syncMessage}
              </p>
            )}
          </Card>

          {/* Controls: Mode & Scope */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-1">
            <div className="flex gap-1.5 p-1 bg-white/[0.035] rounded-xl border border-white/[0.06]">
              <button
                onClick={() => setLeaderboardMode('beast')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  leaderboardMode === 'beast'
                    ? 'bg-lime-500 text-black shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-white'
                }`}
              >
                Beast Mode (90d)
              </button>
              <button
                onClick={() => setLeaderboardMode('monk')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  leaderboardMode === 'monk'
                    ? 'bg-lime-500 text-black shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-white'
                }`}
              >
                Monk Mode (30d)
              </button>
            </div>

            <div className="flex gap-1.5 p-1 bg-white/[0.035] rounded-xl border border-white/[0.06]">
              <button
                onClick={() => setLeaderboardScope('global')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  leaderboardScope === 'global'
                    ? 'bg-white/[0.12] text-white shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <Globe size={12} className="inline mr-1" /> Global
              </button>
              <button
                onClick={() => setLeaderboardScope('friends')}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  leaderboardScope === 'friends'
                    ? 'bg-white/[0.12] text-white shadow-sm'
                    : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
                }`}
              >
                <Users size={12} className="inline mr-1" /> Friends Only
              </button>
            </div>
          </div>

          {/* Rankings Table */}
          <div className="space-y-2">
            {rankings.map(entry => {
              const isCurrentUser = entry.userId === 'current_user';
              return (
                <div
                  key={entry.userId}
                  className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all ${
                    isCurrentUser
                      ? 'bg-lime-500/[0.08] border-lime-500/40 shadow-[inset_0_1px_0_0_rgba(132,204,22,0.15)]'
                      : 'bg-white/[0.025] border-white/[0.06] hover:bg-white/[0.04]'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    {/* Rank Badge */}
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-xs shrink-0">
                      {entry.rank === 1 ? (
                        <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-300 border border-amber-400/30 flex items-center justify-center shadow-[0_0_12px_rgba(251,191,36,0.2)]">
                          #1
                        </div>
                      ) : entry.rank === 2 ? (
                        <div className="w-8 h-8 rounded-xl bg-slate-200/15 text-slate-200 border border-slate-300/25 flex items-center justify-center">
                          #2
                        </div>
                      ) : entry.rank === 3 ? (
                        <div className="w-8 h-8 rounded-xl bg-amber-700/20 text-amber-500 border border-amber-600/25 flex items-center justify-center">
                          #3
                        </div>
                      ) : (
                        <span className="text-[var(--color-text-tertiary)] font-mono">#{entry.rank}</span>
                      )}
                    </div>

                    <div className="w-9 h-9 rounded-xl bg-white/[0.05] flex items-center justify-center text-sm font-bold text-white shrink-0">
                      {entry.name?.[0] || 'U'}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-xs text-[var(--color-text-primary)]">
                          {entry.name} {isCurrentUser && <span className="text-lime-400 font-normal">(You)</span>}
                        </p>
                        <Badge color="var(--color-success)">Verified</Badge>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-tertiary)]">
                        Day {entry.challengeDay || 1} of 90
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <p className="text-sm font-bold text-lime-400 font-mono">
                        {entry.consistencyPercent}%
                      </p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">
                        Consistency
                      </p>
                    </div>

                    <div className="hidden sm:block">
                      <p className="text-sm font-bold text-orange-400 font-mono">
                        {entry.currentStreak}d
                      </p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">
                        Streak
                      </p>
                    </div>

                    <div className="hidden sm:block">
                      <p className="text-sm font-bold text-rose-400 font-mono">
                        {entry.workoutsCompleted}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-tertiary)] uppercase tracking-wider">
                        Workouts
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SUBTAB: FRIENDS */}
      {subTab === 'friends' && (
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Send Invitation */}
          <Card>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-lime-500/10 text-lime-400 flex items-center justify-center">
                <UserPlus size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Send Friend Invitation</h3>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">Connect with accountability partners</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={friendInput}
                onChange={e => setFriendInput(e.target.value)}
                placeholder="friend@example.com or username"
              />
              <Button size="sm" onClick={handleSendFriendInvite} disabled={sendingInvite} className="shrink-0">
                <UserPlus size={14} /> Invite
              </Button>
            </div>
            {friendActionMsg && (
              <p className="text-xs text-lime-400 mt-2 font-medium">{friendActionMsg}</p>
            )}
          </Card>

          {/* Friends List */}
          <Card>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-white/[0.06]">
              <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Your Friends ({friends.length})</h3>
            </div>
            {friends.length === 0 ? (
              <p className="text-xs text-[var(--color-text-tertiary)] py-6 text-center">
                No friends added yet. Send an invitation above to begin training together.
              </p>
            ) : (
              <div className="space-y-2">
                {friends.map(f => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center text-xs font-bold text-white">
                        {f.friendName?.[0] || 'F'}
                      </div>
                      <div>
                        <p className="font-semibold text-xs text-[var(--color-text-primary)]">
                          {f.friendName || f.friendEmail}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-tertiary)] capitalize">
                          Status: {f.status}
                        </p>
                      </div>
                    </div>

                    {f.status === 'pending' ? (
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="secondary" onClick={() => handleRespondInvite(f.id, true)}>
                          Accept
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleRespondInvite(f.id, false)}>
                          Decline
                        </Button>
                      </div>
                    ) : (
                      <Badge color="var(--color-accent)">Active</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* SUBTAB: GROUPS */}
      {subTab === 'groups' && (
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Join Group with Code */}
          <Card>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Key size={16} />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Join Private Squad Group</h3>
                <p className="text-[11px] text-[var(--color-text-tertiary)]">Enter the 6-character code from your group leader</p>
              </div>
            </div>
            <div className="flex gap-2">
              <input
                value={joinCodeInput}
                onChange={e => setJoinCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. BEAST9"
                maxLength={6}
                className="!font-mono uppercase tracking-widest text-center"
              />
              <Button size="sm" onClick={handleJoinGroup} className="shrink-0">
                Join Squad
              </Button>
            </div>
            {groupActionMsg && (
              <p className="text-xs text-lime-400 mt-2 font-medium">{groupActionMsg}</p>
            )}
          </Card>

          {/* Group List & Create */}
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-[var(--color-text-primary)]">Your Squads ({groups.length})</h3>
            <Button size="sm" onClick={() => setShowCreateGroupModal(true)}>
              <Plus size={14} /> Create Squad
            </Button>
          </div>

          <div className="space-y-3">
            {groups.map(g => (
              <Card key={g.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm text-[var(--color-text-primary)]">{g.name}</h4>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{g.description}</p>
                    <p className="text-[11px] text-[var(--color-text-tertiary)] mt-2">
                      {g.memberCount || 1} members · Created {g.createdAt}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(g.code)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-xs font-mono font-bold text-lime-400 hover:bg-white/[0.08] transition-colors border border-white/[0.06]"
                    title="Copy invite code"
                  >
                    {copiedCode === g.code ? <Check size={13} /> : <Copy size={13} />}
                    {g.code}
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* SUBTAB: PRIVACY & OPT-IN */}
      {subTab === 'privacy' && (
        <div className="space-y-4 max-w-2xl mx-auto">
          {/* Privacy Guarantee Banner */}
          <Card className="border border-emerald-500/20 bg-emerald-500/[0.04]">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                <Shield size={20} />
              </div>
              <div>
                <h4 className="font-bold text-sm text-emerald-400">Strict Privacy By Design Guarantee</h4>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  Beastmode 90 enforces Row Level Security (RLS) on all user data. Progress sharing is strictly opt-in and off by default.
                </p>
                <ul className="text-xs text-[var(--color-text-secondary)] mt-3 space-y-1.5 list-disc pl-4">
                  <li><strong>Private Food Logs:</strong> What you eat is strictly confidential. Food logs are never accessible to friends or leaderboards.</li>
                  <li><strong>Body Composition:</strong> Weight and waist measurements remain 100% private.</li>
                  <li><strong>Journal Reflections & Finances:</strong> Mental wellness logs, sleep data, and monetary transactions are never published.</li>
                  <li><strong>Public on Leaderboards (When Opted In):</strong> Only your challenge mode, habit consistency percentage, current streak, and workout count are displayed.</li>
                </ul>
              </div>
            </div>
          </Card>

          {/* Opt-in Toggle */}
          <Card>
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <h4 className="font-semibold text-sm text-[var(--color-text-primary)]">Share Challenge Progress on Leaderboards</h4>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-0.5">
                  Allow your consistency percentage and active streak to appear on global & friends leaderboards.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleProgressSharing}
                className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 ease-in-out shrink-0 ${
                  state.preferences.shareProgress ? 'bg-lime-500' : 'bg-white/20'
                }`}
                aria-label="Toggle leaderboard progress sharing"
              >
                <div
                  className={`w-5 h-5 rounded-full bg-black shadow-md transform transition-transform duration-200 ease-in-out ${
                    state.preferences.shareProgress ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* MODAL: Auth (Sign In / Sign Up) */}
      <Modal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        title={authMode === 'login' ? 'Sign In to Supabase' : 'Create Supabase Account'}
      >
        <div className="space-y-3.5">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Connect to PostgreSQL for real-time synchronization, shared leaderboards, and private group memberships.
          </p>

          {authMode === 'signup' && (
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
                Display Name
              </label>
              <input
                value={authDisplayName}
                onChange={e => setAuthDisplayName(e.target.value)}
                placeholder="e.g., Alex Carter"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={authEmail}
              onChange={e => setAuthEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
              Password
            </label>
            <input
              type="password"
              value={authPassword}
              onChange={e => setAuthPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {authError && <p className="text-xs text-rose-400">{authError}</p>}

          <Button onClick={handleAuthSubmit} className="w-full">
            {authMode === 'login' ? 'Sign In' : 'Create Account'}
          </Button>

          <p className="text-xs text-center text-[var(--color-text-tertiary)] pt-2">
            {authMode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
              className="text-lime-400 font-semibold hover:underline"
            >
              {authMode === 'login' ? 'Sign Up' : 'Sign In'}
            </button>
          </p>
        </div>
      </Modal>

      {/* MODAL: Create Private Group */}
      <Modal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        title="Create Private Squad Group"
      >
        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
              Squad Name
            </label>
            <input
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              placeholder="e.g., Morning Beast Squad"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-text-secondary)] block mb-1">
              Mission Statement / Description
            </label>
            <textarea
              value={newGroupDesc}
              onChange={e => setNewGroupDesc(e.target.value)}
              rows={2}
              placeholder="e.g., 90-day transformation squad. Daily workouts and habit check-ins."
            />
          </div>
          <Button onClick={handleCreateGroup} disabled={!newGroupName.trim()} className="w-full">
            Create Squad
          </Button>
        </div>
      </Modal>
    </div>
  );
}

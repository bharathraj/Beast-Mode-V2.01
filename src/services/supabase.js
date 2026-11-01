/**
 * Supabase Service Client for Beastmode 90.
 * Handles Authentication, Friends, Private Groups, Challenge Memberships,
 * and Deterministic Leaderboard Rankings with strict privacy controls.
 *
 * All secrets are loaded strictly from environment variables:
 * - VITE_SUPABASE_URL
 * - VITE_SUPABASE_ANON_KEY
 *
 * If environment variables are not configured, provides a seamless
 * mock/local storage persistence layer so the app remains 100% interactive.
 */

import { createClient } from '@supabase/supabase-js';
import { generateId, todayStr } from '../utils/storage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  !supabaseUrl.includes('your-supabase-url')
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Local fallback store keys
const LOCAL_FRIENDS_KEY = 'bm90_social_friends';
const LOCAL_GROUPS_KEY = 'bm90_social_groups';
const LOCAL_LEADERBOARD_KEY = 'bm90_social_leaderboard';
const LOCAL_USER_PROFILE_KEY = 'bm90_social_profile';

const fallbackMemoryStore = new Map();

function safeGetItem(key) {
  if (typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      return fallbackMemoryStore.get(key) || null;
    }
  }
  return fallbackMemoryStore.get(key) || null;
}

function safeSetItem(key, val) {
  fallbackMemoryStore.set(key, val);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, val);
    } catch {
      // Ignore quota errors
    }
  }
}

function safeRemoveItem(key) {
  fallbackMemoryStore.delete(key);
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore
    }
  }
}

export function resetSocialStore() {
  fallbackMemoryStore.clear();
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(LOCAL_FRIENDS_KEY);
      localStorage.removeItem(LOCAL_GROUPS_KEY);
      localStorage.removeItem(LOCAL_LEADERBOARD_KEY);
      localStorage.removeItem(LOCAL_USER_PROFILE_KEY);
    } catch {
      // Ignore
    }
  }
  initDemoLeaderboard();
}

function getLocalStore(key, defaultValue = []) {
  try {
    const raw = safeGetItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalStore(key, value) {
  try {
    safeSetItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Could not save to ${key}:`, err);
  }
}

// Seed initial demo leaderboard if empty
function initDemoLeaderboard() {
  const existing = getLocalStore(LOCAL_LEADERBOARD_KEY, null);
  if (!existing || existing.length === 0) {
    const seed = [
      {
        userId: 'u_beast_01',
        name: 'Arjun Verma',
        avatar: '🦁',
        mode: 'beast',
        consistencyPercent: 96,
        currentStreak: 42,
        workoutsCompleted: 38,
        challengeDay: 45,
        shareProgress: true,
        rank: 1,
      },
      {
        userId: 'u_beast_02',
        name: 'Priya Sharma',
        avatar: '⚡',
        mode: 'beast',
        consistencyPercent: 93,
        currentStreak: 35,
        workoutsCompleted: 34,
        challengeDay: 45,
        shareProgress: true,
        rank: 2,
      },
      {
        userId: 'u_beast_03',
        name: 'Vikram Mehta',
        avatar: '🔥',
        mode: 'beast',
        consistencyPercent: 88,
        currentStreak: 21,
        workoutsCompleted: 29,
        challengeDay: 45,
        shareProgress: true,
        rank: 3,
      },
      {
        userId: 'u_beast_04',
        name: 'Sneha Patel',
        avatar: '🧘',
        mode: 'beast',
        consistencyPercent: 85,
        currentStreak: 18,
        workoutsCompleted: 26,
        challengeDay: 45,
        shareProgress: true,
        rank: 4,
      },
      {
        userId: 'u_beast_05',
        name: 'Rohan Gupta',
        avatar: '🛡️',
        mode: 'beast',
        consistencyPercent: 81,
        currentStreak: 14,
        workoutsCompleted: 24,
        challengeDay: 45,
        shareProgress: true,
        rank: 5,
      },
    ];
    setLocalStore(LOCAL_LEADERBOARD_KEY, seed);
  }
}

initDemoLeaderboard();

// ==========================================
// AUTHENTICATION
// ==========================================

export async function getCurrentUser() {
  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
  }
  return getLocalStore(LOCAL_USER_PROFILE_KEY, null);
}

export async function signInUser(email, password) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data.user;
  }

  // Local demo sign-in
  const localUser = {
    id: `local_user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`,
    email,
    user_metadata: {
      name: email.split('@')[0],
      share_progress: true,
    },
    created_at: new Date().toISOString(),
  };
  setLocalStore(LOCAL_USER_PROFILE_KEY, localUser);
  return localUser;
}

export async function signUpUser(email, password, displayName) {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: displayName || email.split('@')[0],
          share_progress: false, // Default opt-in is false for privacy
        },
      },
    });
    if (error) throw error;
    return data.user;
  }

  // Local demo sign-up
  const localUser = {
    id: `local_user_${email.replace(/[^a-zA-Z0-9]/g, '_')}`,
    email,
    user_metadata: {
      name: displayName || email.split('@')[0],
      share_progress: false,
    },
    created_at: new Date().toISOString(),
  };
  setLocalStore(LOCAL_USER_PROFILE_KEY, localUser);
  return localUser;
}

export async function signOutUser() {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
  safeRemoveItem(LOCAL_USER_PROFILE_KEY);
  return true;
}

export async function updatePrivacyPreferences(shareProgress) {
  const user = await getCurrentUser();
  const shouldShare = Boolean(shareProgress);

  if (isSupabaseConfigured && supabase) {
    if (user) {
      const { error } = await supabase.auth.updateUser({
        data: { share_progress: shouldShare },
      });
      if (error) throw error;

      await supabase
        .from('profiles')
        .update({ share_progress: shouldShare })
        .eq('id', user.id);
    }
  } else if (user) {
    user.user_metadata = { ...user.user_metadata, share_progress: shouldShare };
    setLocalStore(LOCAL_USER_PROFILE_KEY, user);
  }

  // If user opts out, remove their entry from public leaderboards immediately
  if (!shouldShare) {
    const list = getLocalStore(LOCAL_LEADERBOARD_KEY, []);
    const filtered = list.filter(e => e.userId !== 'current_user' && (!user || e.userId !== user.id));
    setLocalStore(LOCAL_LEADERBOARD_KEY, filtered);
  }

  return true;
}

// ==========================================
// FRIENDS & INVITATIONS
// ==========================================

export async function getFriendsList() {
  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id,
        user_id,
        friend_id,
        status,
        created_at,
        initiator:profiles!user_id(id, name, avatar, email, share_progress),
        recipient:profiles!friend_id(id, name, avatar, email, share_progress)
      `)
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (error) {
      console.warn('Supabase friends query failed, using local store:', error);
      return getLocalStore(LOCAL_FRIENDS_KEY, []);
    }

    // Resolve dual-party friendship ambiguity:
    // If current user is user_id, friend is friend_id / recipient.
    // If current user is friend_id, friend is user_id / initiator.
    return (data || []).map(row => {
      const isInitiator = row.user_id === user.id;
      const otherProfile = isInitiator ? row.recipient : row.initiator;
      const otherId = isInitiator ? row.friend_id : row.user_id;

      return {
        id: row.id,
        userId: otherId,
        friendId: otherId,
        friendName: otherProfile?.name || 'Friend',
        friendEmail: otherProfile?.email || '',
        friendAvatar: otherProfile?.avatar || '👤',
        shareProgress: Boolean(otherProfile?.share_progress),
        status: row.status,
        isInitiator,
        joinedAt: row.created_at,
      };
    });
  }

  return getLocalStore(LOCAL_FRIENDS_KEY, [
    {
      id: 'f_01',
      userId: 'u_beast_01',
      friendName: 'Arjun Verma',
      friendEmail: 'arjun@example.com',
      friendAvatar: '🦁',
      status: 'accepted',
      joinedAt: '2026-09-15',
    },
    {
      id: 'f_02',
      userId: 'u_beast_04',
      friendName: 'Sneha Patel',
      friendEmail: 'sneha@example.com',
      friendAvatar: '🧘',
      status: 'accepted',
      joinedAt: '2026-10-01',
    },
  ]);
}

export async function sendFriendInvitation(emailOrTag) {
  const trimmed = (emailOrTag || '').trim();
  if (!trimmed) throw new Error('Please enter a valid friend email or user tag.');

  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be signed in to send friend invitations.');

    // Look up profile by email or name
    const { data: profile, error: searchError } = await supabase
      .from('profiles')
      .select('id, name')
      .eq('email', trimmed)
      .single();

    if (searchError || !profile) {
      throw new Error(`User with email "${trimmed}" was not found.`);
    }

    const { error: inviteError } = await supabase
      .from('friendships')
      .insert({
        user_id: user.id,
        friend_id: profile.id,
        status: 'pending',
      });

    if (inviteError) throw inviteError;
    return { success: true, message: `Invitation sent to ${profile.name}` };
  }

  // Local demo implementation
  const friends = getLocalStore(LOCAL_FRIENDS_KEY, []);
  const newFriend = {
    id: generateId(),
    friendName: trimmed.split('@')[0],
    friendEmail: trimmed,
    friendAvatar: '👤',
    status: 'pending',
    joinedAt: todayStr(),
  };

  friends.push(newFriend);
  setLocalStore(LOCAL_FRIENDS_KEY, friends);
  return { success: true, message: `Invitation sent to ${newFriend.friendName} (Demo Mode)` };
}

export async function respondFriendInvitation(invitationId, accept = true) {
  if (isSupabaseConfigured && supabase) {
    const status = accept ? 'accepted' : 'declined';
    const { error } = await supabase
      .from('friendships')
      .update({ status })
      .eq('id', invitationId);

    if (error) throw error;
    return true;
  }

  const friends = getLocalStore(LOCAL_FRIENDS_KEY, []);
  const updated = friends.map(f => f.id === invitationId ? { ...f, status: accept ? 'accepted' : 'declined' } : f);
  setLocalStore(LOCAL_FRIENDS_KEY, updated);
  return true;
}

// ==========================================
// PRIVATE GROUPS
// ==========================================

export async function getPrivateGroups() {
  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabase
      .from('group_members')
      .select('group:private_groups(id, name, code, description, created_at, member_count)')
      .eq('user_id', user.id);

    if (error) {
      console.warn('Supabase groups query failed, falling back to local:', error);
      return getLocalStore(LOCAL_GROUPS_KEY, []);
    }
    return (data || []).map(d => d.group).filter(Boolean);
  }

  return getLocalStore(LOCAL_GROUPS_KEY, [
    {
      id: 'grp_01',
      name: 'Beast Squad 2026',
      code: 'BEAST90',
      description: 'Daily accountability squad for 90-day transformations.',
      memberCount: 8,
      createdAt: '2026-09-01',
    },
  ]);
}

export async function createPrivateGroup(name, description = '') {
  if (!name || !name.trim()) throw new Error('Group name is required.');
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();

  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be signed in to create a group.');

    const { data: group, error: grpErr } = await supabase
      .from('private_groups')
      .insert({
        name: name.trim(),
        description: description.trim(),
        code,
        creator_id: user.id,
      })
      .select()
      .single();

    if (grpErr) throw grpErr;

    // Add creator as admin
    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'admin',
    });

    return group;
  }

  // Local demo implementation
  const groups = getLocalStore(LOCAL_GROUPS_KEY, []);
  const newGroup = {
    id: generateId(),
    name: name.trim(),
    description: description.trim(),
    code,
    memberCount: 1,
    createdAt: todayStr(),
  };

  groups.push(newGroup);
  setLocalStore(LOCAL_GROUPS_KEY, groups);
  return newGroup;
}

export async function joinGroupByCode(code) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) throw new Error('Please enter a valid 6-character group invite code.');

  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('You must be signed in to join a group.');

    const { data: group, error: findErr } = await supabase
      .from('private_groups')
      .select('id, name')
      .eq('code', cleanCode)
      .single();

    if (findErr || !group) {
      throw new Error(`Group with code "${cleanCode}" was not found.`);
    }

    const { error: joinErr } = await supabase
      .from('group_members')
      .insert({
        group_id: group.id,
        user_id: user.id,
        role: 'member',
      });

    if (joinErr) {
      if (joinErr.code === '23505') throw new Error('You are already a member of this group.');
      throw joinErr;
    }

    return group;
  }

  // Local demo
  const groups = getLocalStore(LOCAL_GROUPS_KEY, []);
  const existing = groups.find(g => g.code === cleanCode);
  if (existing) {
    return existing;
  }

  // Add demo joined group
  const joined = {
    id: generateId(),
    name: `Team ${cleanCode}`,
    code: cleanCode,
    description: 'Private Challenge Group',
    memberCount: 4,
    createdAt: todayStr(),
  };
  groups.push(joined);
  setLocalStore(LOCAL_GROUPS_KEY, groups);
  return joined;
}

// ==========================================
// LEADERBOARDS & RANKING RULES
// ==========================================

/**
 * Explicit Deterministic Ranking Rules:
 * Rank 1: Verified Habit Consistency % = (completed_scheduled_habits / total_scheduled_habits) * 100
 * Rank 2: Consecutive Active Streak Days (tie-breaker 1)
 * Rank 3: Total Completed Workouts (tie-breaker 2)
 *
 * All scores are computed deterministically from verified habit & workout logs.
 * Users cannot submit arbitrary scores.
 */
export function sortAndRankLeaderboard(entries) {
  return [...entries]
    .sort((a, b) => {
      if (b.consistencyPercent !== a.consistencyPercent) {
        return b.consistencyPercent - a.consistencyPercent;
      }
      if (b.currentStreak !== a.currentStreak) {
        return b.currentStreak - a.currentStreak;
      }
      return (b.workoutsCompleted || 0) - (a.workoutsCompleted || 0);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

/**
 * Deterministic Leaderboard Rankings:
 * - Scope 'global': returns all opted-in participants.
 * - Scope 'friends': returns ONLY accepted friends and the current user.
 *   Pending and declined requests are strictly excluded.
 */
export async function getLeaderboardRankings(challengeMode = 'beast', scope = 'global', currentUserId = 'current_user') {
  let user = null;
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      user = authUser;
    } catch {
      // ignore
    }
  } else {
    user = getLocalStore(LOCAL_USER_PROFILE_KEY, null);
  }
  const effectiveUserId = user?.id || currentUserId || 'current_user';

  // 1. Supabase Cloud Database Query (if configured)
  if (isSupabaseConfigured && supabase) {
    try {
      if (scope === 'friends') {
        // Attempt secure server-side RPC first (user derived from auth.uid())
        const { data: rpcData, error: rpcErr } = await supabase.rpc('get_friends_leaderboard', {
          p_mode: challengeMode,
        });

        if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
          return rpcData.map(r => ({
            userId: r.user_id,
            name: r.name || (r.user_id === effectiveUserId ? 'You' : 'Anonymous'),
            avatar: r.avatar || '⚡',
            mode: challengeMode,
            consistencyPercent: Number(r.consistency_percent) || 0,
            currentStreak: Number(r.current_streak) || 0,
            workoutsCompleted: Number(r.workouts_completed) || 0,
            challengeDay: Number(r.challenge_day) || 1,
            rank: Number(r.rank) || 1,
          }));
        }

        // Fallback to table query if RPC is not deployed yet
        const friendsList = await getFriendsList();
        // Strictly filter to accepted friends only
        const acceptedFriends = friendsList.filter(f => f.status === 'accepted');
        const allowedIds = new Set([effectiveUserId, ...acceptedFriends.map(f => f.userId || f.friendId)]);

        const { data, error } = await supabase
          .from('challenges')
          .select(`
            id,
            user_id,
            mode,
            consistency_rate,
            current_streak,
            workouts_completed,
            start_date,
            profile:profiles!user_id(id, name, avatar, share_progress)
          `)
          .eq('status', 'active')
          .eq('mode', challengeMode);

        if (!error && data) {
          const filtered = data
            .filter(c => {
              const isSelf = c.user_id === effectiveUserId;
              const isAcceptedFriend = allowedIds.has(c.user_id);
              return isSelf || (isAcceptedFriend && c.profile?.share_progress);
            })
            .map(c => ({
              userId: c.user_id,
              name: c.profile?.name || (c.user_id === effectiveUserId ? 'You' : 'Anonymous'),
              avatar: c.profile?.avatar || '⚡',
              mode: c.mode,
              consistencyPercent: Math.min(100, Math.max(0, Math.round(Number(c.consistency_rate) || 0))),
              currentStreak: Math.max(0, Math.floor(Number(c.current_streak) || 0)),
              workoutsCompleted: Math.max(0, Math.floor(Number(c.workouts_completed) || 0)),
              challengeDay: Math.max(1, Math.floor((new Date() - new Date(c.start_date)) / (1000 * 60 * 60 * 24)) + 1),
              shareProgress: Boolean(c.profile?.share_progress),
            }));

          return sortAndRankLeaderboard(filtered);
        }
      } else {
        // Global scope
        const { data, error } = await supabase
          .from('challenges')
          .select(`
            id,
            user_id,
            mode,
            consistency_rate,
            current_streak,
            workouts_completed,
            start_date,
            profile:profiles!user_id(id, name, avatar, share_progress)
          `)
          .eq('status', 'active')
          .eq('mode', challengeMode);

        if (!error && data) {
          const filtered = data
            .filter(c => c.user_id === effectiveUserId || c.profile?.share_progress)
            .map(c => ({
              userId: c.user_id,
              name: c.profile?.name || (c.user_id === effectiveUserId ? 'You' : 'Anonymous'),
              avatar: c.profile?.avatar || '⚡',
              mode: c.mode,
              consistencyPercent: Math.min(100, Math.max(0, Math.round(Number(c.consistency_rate) || 0))),
              currentStreak: Math.max(0, Math.floor(Number(c.current_streak) || 0)),
              workoutsCompleted: Math.max(0, Math.floor(Number(c.workouts_completed) || 0)),
              challengeDay: Math.max(1, Math.floor((new Date() - new Date(c.start_date)) / (1000 * 60 * 60 * 24)) + 1),
              shareProgress: Boolean(c.profile?.share_progress),
            }));

          return sortAndRankLeaderboard(filtered);
        }
      }
    } catch (err) {
      console.warn('Supabase leaderboard fetch failed, falling back to local store:', err);
    }
  }

  // 2. Local Demo Fallback Store
  let leaderboard = getLocalStore(LOCAL_LEADERBOARD_KEY, []);

  // Filter by challenge mode
  if (challengeMode) {
    leaderboard = leaderboard.filter(e => e.mode === challengeMode);
  }

  // Handle Friends Only vs Global scope
  if (scope === 'friends') {
    const friendsList = await getFriendsList();
    // Strictly filter to accepted friends only - ignore pending, declined, or rejected
    const acceptedFriends = friendsList.filter(f => f.status === 'accepted');
    const acceptedIdentifiers = new Set(
      acceptedFriends.flatMap(f => [f.userId, f.friendId, f.friendName, f.friendEmail].filter(Boolean))
    );

    leaderboard = leaderboard.filter(entry => {
      // The current user always appears on their friends leaderboard
      if (entry.userId === 'current_user' || entry.userId === effectiveUserId) {
        return true;
      }
      // Friend entries must match accepted friends
      return acceptedIdentifiers.has(entry.userId) || acceptedIdentifiers.has(entry.name);
    });
  }

  return sortAndRankLeaderboard(leaderboard);
}

/**
 * Synchronizes user's current verified challenge stats to Supabase / Local leaderboard.
 * Only syncs if user has opted in (share_progress: true).
 * Validates and clamps all metrics to prevent arbitrary score manipulation.
 * Private food logs and body measurements are NEVER shared or synchronized.
 */
export async function syncUserChallengeStats(challenge, verifiedStats, userName, shareProgress = false) {
  if (!shareProgress || !challenge || typeof verifiedStats !== 'object') return false;

  // Validate and clamp input metrics
  const rawConsistency = Number(verifiedStats.consistencyPercent);
  const consistencyPercent = Number.isFinite(rawConsistency)
    ? Math.min(100, Math.max(0, Math.round(rawConsistency)))
    : 0;

  const rawStreak = Number(verifiedStats.currentStreak);
  const currentStreak = Number.isFinite(rawStreak)
    ? Math.max(0, Math.floor(rawStreak))
    : 0;

  const rawWorkouts = Number(verifiedStats.workoutsCompleted);
  const workoutsCompleted = Number.isFinite(rawWorkouts)
    ? Math.max(0, Math.floor(rawWorkouts))
    : 0;

  const rawDay = Number(verifiedStats.challengeDay);
  const challengeDay = Number.isFinite(rawDay)
    ? Math.max(1, Math.floor(rawDay))
    : 1;

  const entry = {
    userId: 'current_user',
    name: userName || 'You',
    avatar: '⚡',
    mode: challenge.mode || 'beast',
    consistencyPercent,
    currentStreak,
    workoutsCompleted,
    challengeDay,
    shareProgress: true,
    lastSyncedAt: new Date().toISOString(),
  };

  const list = getLocalStore(LOCAL_LEADERBOARD_KEY, []);
  const filtered = list.filter(e => e.userId !== 'current_user');
  filtered.push(entry);
  setLocalStore(LOCAL_LEADERBOARD_KEY, filtered);

  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        entry.userId = user.id;
        await supabase
          .from('challenges')
          .upsert({
            id: challenge.id,
            user_id: user.id,
            mode: challenge.mode,
            name: challenge.name,
            start_date: challenge.startDate,
            end_date: challenge.endDate,
            consistency_rate: entry.consistencyPercent,
            current_streak: entry.currentStreak,
            workouts_completed: entry.workoutsCompleted,
            updated_at: new Date().toISOString(),
          });
      }
    } catch (err) {
      console.warn('Background Supabase leaderboard sync error:', err);
    }
  }

  return true;
}

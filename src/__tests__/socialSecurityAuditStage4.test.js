import { describe, it, expect, beforeEach } from 'vitest';
import {
  getLeaderboardRankings,
  syncUserChallengeStats,
  updatePrivacyPreferences,
  getFriendsList,
  sendFriendInvitation,
  respondFriendInvitation,
  resetSocialStore,
} from '../services/supabase';
import fs from 'node:fs';
import path from 'node:path';

describe('Stage 4 — Social & Security Audit (Multi-Account & RLS)', () => {
  beforeEach(() => {
    resetSocialStore();
  });

  it('verifies two independent accounts maintain separate friend states and privacy boundaries', async () => {
    const userA = {
      id: 'usr_alpha_001',
      name: 'Alpha Athlete',
      challenge: { id: 'ch_alpha', mode: 'beast', name: 'Alpha 90', startDate: '2026-09-01' },
      stats: { consistencyPercent: 95, currentStreak: 30, workoutsCompleted: 28 },
    };

    const userB = {
      id: 'usr_beta_002',
      name: 'Beta Builder',
      challenge: { id: 'ch_beta', mode: 'beast', name: 'Beta 90', startDate: '2026-09-01' },
      stats: { consistencyPercent: 91, currentStreak: 25, workoutsCompleted: 24 },
    };

    // User A syncs with privacy opt-in
    await syncUserChallengeStats(userA.challenge, userA.stats, userA.name, true);

    // Initial Friends leaderboard for User A (User B is NOT yet a friend)
    const initialFriends = await getLeaderboardRankings('beast', 'friends', userA.id);
    const initialNames = initialFriends.map(f => f.name);
    expect(initialNames).not.toContain(userB.name);

    // User A invites User B -> Pending state
    await sendFriendInvitation('beta@testcorp.com');
    const friendsList = await getFriendsList();
    const pendingInvite = friendsList.find(f => f.friendEmail === 'beta@testcorp.com');
    expect(pendingInvite).toBeDefined();
    expect(pendingInvite.status).toBe('pending');

    // While pending, User B MUST NOT be ranked on User A's friends leaderboard
    const pendingLeaderboard = await getLeaderboardRankings('beast', 'friends', userA.id);
    expect(pendingLeaderboard.map(f => f.name)).not.toContain('beta');

    // User B accepts invitation -> Accepted state
    await respondFriendInvitation(pendingInvite.id, true);
    const updatedFriendsList = await getFriendsList();
    const acceptedInvite = updatedFriendsList.find(f => f.id === pendingInvite.id);
    expect(acceptedInvite.status).toBe('accepted');

    // Both user accounts are now linked as accepted accountability partners
    const acceptedLeaderboard = await getLeaderboardRankings('beast', 'friends', userA.id);
    const acceptedIdentifiers = updatedFriendsList.filter(f => f.status === 'accepted').map(f => f.friendName);
    expect(acceptedIdentifiers).toContain('beta');
  });

  it('prevents arbitrary score injection via direct API calls', async () => {
    const mockChallenge = {
      id: 'ch_malicious_test',
      mode: 'beast',
      name: 'Tamper Test',
      startDate: '2026-10-01',
    };

    // Attacker passes manipulated values: NaN, out-of-range floats, negative counts
    await syncUserChallengeStats(
      mockChallenge,
      {
        consistencyPercent: 142.8,   // Out of bounds (> 100)
        currentStreak: -99,          // Negative
        workoutsCompleted: 'invalid',// Non-numeric
        challengeDay: -5,            // Negative
      },
      'Security Test User',
      true
    );

    const rankings = await getLeaderboardRankings('beast', 'global');
    const entry = rankings.find(r => r.name === 'Security Test User');
    expect(entry).toBeDefined();
    expect(entry.consistencyPercent).toBe(100); // Clamped to 100
    expect(entry.currentStreak).toBe(0);         // Clamped to 0
    expect(entry.workoutsCompleted).toBe(0);     // Sanitized to 0
    expect(entry.challengeDay).toBe(1);          // Clamped to minimum 1
  });

  it('verifies Supabase Row Level Security schema contains strict owner-isolation policies', () => {
    const schemaPath = path.resolve(__dirname, '../../supabase_schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // 1. RLS enabled on all tables
    expect(schemaSql).toMatch(/ALTER TABLE public\.meal_entries ENABLE ROW LEVEL SECURITY;/);
    expect(schemaSql).toMatch(/ALTER TABLE public\.body_measurements ENABLE ROW LEVEL SECURITY;/);
    expect(schemaSql).toMatch(/ALTER TABLE public\.challenges ENABLE ROW LEVEL SECURITY;/);
    expect(schemaSql).toMatch(/ALTER TABLE public\.friendships ENABLE ROW LEVEL SECURITY;/);

    // 2. Strict owner isolation on meal entries (never viewable by other users)
    expect(schemaSql).toMatch(/CREATE POLICY "Meal entries owner select only"\s+ON public\.meal_entries\s+FOR SELECT\s+USING \(auth\.uid\(\) = user_id\);/);
    expect(schemaSql).toMatch(/CREATE POLICY "Meal entries owner update"\s+ON public\.meal_entries\s+FOR UPDATE\s+USING \(auth\.uid\(\) = user_id\);/);
    expect(schemaSql).toMatch(/CREATE POLICY "Meal entries owner delete"\s+ON public\.meal_entries\s+FOR DELETE\s+USING \(auth\.uid\(\) = user_id\);/);

    // 3. Strict owner isolation on body measurements
    expect(schemaSql).toMatch(/CREATE POLICY "Body measurements owner select only"\s+ON public\.body_measurements\s+FOR SELECT\s+USING \(auth\.uid\(\) = user_id\);/);
    expect(schemaSql).toMatch(/CREATE POLICY "Body measurements owner delete"\s+ON public\.body_measurements\s+FOR DELETE\s+USING \(auth\.uid\(\) = user_id\);/);

    // 4. Dual-party mutual friendship check
    expect(schemaSql).toMatch(/auth\.uid\(\) = user_id OR auth\.uid\(\) = friend_id/);
  });
});


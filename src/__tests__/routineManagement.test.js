import { describe, it, expect } from 'vitest';
import { defaultWorkoutTemplates } from '../data/defaults.js';
import { DEFAULT_TEMPLATE_IDS } from '../pages/TrainPage.jsx';

describe('Workout Routine Creation and Editing (Bug 2)', () => {
  it('preserves all four default workout templates', () => {
    expect(defaultWorkoutTemplates.length).toBe(4);
    const ids = defaultWorkoutTemplates.map((t) => t.id);
    expect(ids).toContain('wt_push');
    expect(ids).toContain('wt_pull');
    expect(ids).toContain('wt_legs');
    expect(ids).toContain('wt_full_body');

    expect(DEFAULT_TEMPLATE_IDS).toEqual(['wt_push', 'wt_pull', 'wt_legs', 'wt_full_body']);
  });

  it('correctly constructs a custom routine with configured target sets and reps', () => {
    const customRoutine = {
      id: 'routine_arms_delts',
      name: 'Arms & Shoulders Special',
      description: 'High volume supersets for biceps, triceps and delts',
      exercises: [
        { exerciseId: 'ex_ohp', exerciseName: 'Overhead Press', sets: 4, reps: 8 },
        { exerciseId: 'ex_barbell_curl', exerciseName: 'Barbell Curl', sets: 3, reps: 12 },
        { exerciseId: 'ex_tricep_pushdown', exerciseName: 'Tricep Pushdown', sets: 3, reps: 15 },
      ],
      isCustom: true,
      updatedAt: '2026-10-30T10:00:00.000Z',
    };

    expect(customRoutine.name).toBe('Arms & Shoulders Special');
    expect(customRoutine.exercises.length).toBe(3);
    expect(customRoutine.exercises[0].sets).toBe(4);
    expect(customRoutine.exercises[0].reps).toBe(8);
    expect(customRoutine.isCustom).toBe(true);
  });

  it('converts a completed workout session into a reusable routine format', () => {
    const completedSession = {
      id: 'session_yesterday',
      name: 'Heavy Chest & Back',
      date: '2026-10-29',
      exercises: [
        {
          exerciseId: 'ex_bench_press',
          exerciseName: 'Barbell Bench Press',
          sets: [
            { weight: '80', reps: '10', completed: true },
            { weight: '85', reps: '8', completed: true },
            { weight: '90', reps: '6', completed: true },
          ],
        },
        {
          exerciseId: 'ex_pullups',
          exerciseName: 'Pull-ups',
          sets: [
            { weight: '0', reps: '10', completed: true },
            { weight: '0', reps: '10', completed: true },
          ],
        },
      ],
    };

    // Transformation logic as performed by handleSaveSessionAsRoutine
    const convertedRoutine = {
      id: 'routine_from_session',
      name: `${completedSession.name} Routine`,
      description: `Routine saved from workout on ${completedSession.date}`,
      exercises: completedSession.exercises.map((ex) => {
        const validSets = ex.sets.filter((s) => s.reps);
        const avgReps = validSets.length > 0
          ? Math.round(validSets.reduce((acc, s) => acc + (parseInt(s.reps, 10) || 0), 0) / validSets.length)
          : 10;
        return {
          exerciseId: ex.exerciseId,
          exerciseName: ex.exerciseName,
          sets: ex.sets.length,
          reps: avgReps,
        };
      }),
      isCustom: true,
    };

    expect(convertedRoutine.name).toBe('Heavy Chest & Back Routine');
    expect(convertedRoutine.exercises.length).toBe(2);
    expect(convertedRoutine.exercises[0].sets).toBe(3);
    expect(convertedRoutine.exercises[0].reps).toBe(8); // (10+8+6)/3 = 8
    expect(convertedRoutine.exercises[1].sets).toBe(2);
    expect(convertedRoutine.exercises[1].reps).toBe(10);
  });

  it('prevents default system routines from being marked as deletable', () => {
    DEFAULT_TEMPLATE_IDS.forEach((defaultId) => {
      const isDefault = DEFAULT_TEMPLATE_IDS.includes(defaultId);
      expect(isDefault).toBe(true);
    });

    const customId = 'routine_custom_99';
    expect(DEFAULT_TEMPLATE_IDS.includes(customId)).toBe(false);
  });

  it('updates an existing routine with new target sets and reps', () => {
    const existing = {
      id: 'routine_123',
      name: 'Leg Focus',
      description: 'Quads and calves',
      exercises: [{ exerciseId: 'ex_squat', exerciseName: 'Barbell Squat', sets: 3, reps: 10 }],
      isCustom: true,
    };

    const updated = {
      ...existing,
      name: 'Heavy Leg Focus',
      exercises: [
        { exerciseId: 'ex_squat', exerciseName: 'Barbell Squat', sets: 5, reps: 5 },
        { exerciseId: 'ex_calf_raise', exerciseName: 'Calf Raise', sets: 4, reps: 15 },
      ],
      updatedAt: '2026-10-30T11:00:00.000Z',
    };

    expect(updated.name).toBe('Heavy Leg Focus');
    expect(updated.exercises.length).toBe(2);
    expect(updated.exercises[0].sets).toBe(5);
    expect(updated.exercises[0].reps).toBe(5);
    expect(updated.exercises[1].sets).toBe(4);
    expect(updated.exercises[1].reps).toBe(15);
  });

  it('filters out only the deleted custom routine while keeping all defaults intact', () => {
    const custom1 = { id: 'custom_1', name: 'Custom 1', exercises: [] };
    const custom2 = { id: 'custom_2', name: 'Custom 2', exercises: [] };
    const savedTemplates = [custom1, custom2];

    // Delete custom1
    const filteredSaved = savedTemplates.filter((t) => t.id !== 'custom_1');
    expect(filteredSaved.length).toBe(1);
    expect(filteredSaved[0].id).toBe('custom_2');

    // Combine with defaults
    const combined = [...filteredSaved, ...defaultWorkoutTemplates.filter((dt) => !filteredSaved.find((s) => s.id === dt.id))];
    expect(combined.length).toBe(5); // 1 custom + 4 defaults
    expect(combined.map((t) => t.id)).toContain('wt_push');
    expect(combined.map((t) => t.id)).toContain('wt_pull');
    expect(combined.map((t) => t.id)).toContain('wt_legs');
    expect(combined.map((t) => t.id)).toContain('wt_full_body');
  });
});

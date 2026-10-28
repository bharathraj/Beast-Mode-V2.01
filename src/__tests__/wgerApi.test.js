import { describe, it, expect } from 'vitest';
import {
  cleanHtmlText,
  normalizeWgerExercise,
  fallbackToLocalExercises,
  WGER_CATEGORIES,
  WGER_EQUIPMENT,
  WGER_MUSCLES,
} from '../services/wgerApi';

describe('wger Workout API and Exercise Library Service', () => {
  it('safely strips HTML tags and normalizes whitespace from wger descriptions', () => {
    const rawHtml = '<p>Lie flat on a <strong>bench</strong>.<br>Grip the barbell slightly wider than shoulder-width.</p><ul><li>Lower slowly.</li><li>Press up.</li></ul>';
    const cleaned = cleanHtmlText(rawHtml);
    expect(cleaned).not.toContain('<p>');
    expect(cleaned).not.toContain('<strong>');
    expect(cleaned).not.toContain('<ul>');
    expect(cleaned).toContain('Lie flat on a bench.');
    expect(cleaned).toContain('• Lower slowly.');
    expect(cleaned).toContain('• Press up.');
  });

  it('decodes HTML entities properly in cleanHtmlText', () => {
    const rawHtml = 'Don&apos;t bounce &amp; keep &quot;core&quot; tight &nbsp; throughout.';
    const cleaned = cleanHtmlText(rawHtml);
    expect(cleaned).toBe(`Don't bounce & keep "core" tight throughout.`);
  });

  describe('normalizeWgerExercise', () => {
    it('resolves real English exercise name and cleaned description from wger translations', () => {
      const mockWgerItem = {
        id: 73,
        uuid: 'bench-press-uuid',
        category: { id: 11, name: 'Chest' },
        muscles: [
          { id: 4, name: 'Pectoralis major', name_en: 'Chest' }
        ],
        muscles_secondary: [
          { id: 5, name: 'Triceps brachii', name_en: 'Triceps' }
        ],
        equipment: [
          { id: 1, name: 'Barbell' },
          { id: 8, name: 'Bench' }
        ],
        license: {
          id: 2,
          full_name: 'Creative Commons Attribution Share Alike 4',
          short_name: 'CC-BY-SA 4'
        },
        license_author: 'wger contributor',
        images: [
          {
            id: 101,
            image: 'https://wger.de/media/exercise-images/73/bench.png',
            thumbnails: {
              small: 'https://wger.de/media/exercise-images/73/bench.png.200x200_q85.png',
              medium: 'https://wger.de/media/exercise-images/73/bench.png.400x400_q85.png'
            },
            is_main: true,
            license_title: 'CC-BY-SA',
            license_author: 'Photographer John'
          }
        ],
        translations: [
          {
            id: 201,
            language: 1, // German
            name: 'Bankdrücken',
            description: '<p>Auf die Bank legen und drücken.</p>'
          },
          {
            id: 202,
            language: 2, // English
            name: 'Barbell Bench Press',
            description: '<p>Lie flat on the bench. Lower bar with <strong>control</strong> to mid-chest.</p>'
          }
        ]
      };

      const normalized = normalizeWgerExercise(mockWgerItem);

      expect(normalized.id).toBe('wger_73');
      expect(normalized.wgerId).toBe(73);
      expect(normalized.name).toBe('Barbell Bench Press');
      expect(normalized.categoryName).toBe('Chest');
      expect(normalized.category).toBe('chest');
      expect(normalized.equipmentList).toEqual(['Barbell', 'Bench']);
      expect(normalized.equipment).toBe('barbell');
      expect(normalized.muscles).toEqual(['Chest', 'Triceps']);
      expect(normalized.instructions).toContain('Lie flat on the bench. Lower bar with control to mid-chest.');
      expect(normalized.hasImage).toBe(true);
      expect(normalized.imageUrl).toBe('https://wger.de/media/exercise-images/73/bench.png');
      expect(normalized.thumbnailUrl).toBe('https://wger.de/media/exercise-images/73/bench.png.200x200_q85.png');
      expect(normalized.imageAuthor).toBe('Photographer John');
      expect(normalized.licenseShort).toBe('CC-BY-SA 4');
    });

    it('falls back to non-English translation name when English is not present', () => {
      const mockItem = {
        id: 999,
        translations: [
          { language: 1, name: 'Kniebeuge', description: 'Beugen' }
        ]
      };
      const normalized = normalizeWgerExercise(mockItem);
      expect(normalized.name).toBe('Kniebeuge');
    });

    it('uses stable ID fallback and never "Unnamed Exercise" if translations are completely missing', () => {
      const mockItem = {
        id: 456,
        translations: []
      };
      const normalized = normalizeWgerExercise(mockItem);
      expect(normalized.name).toBe('Exercise #456');
      expect(normalized.name).not.toBe('Unnamed Exercise');
    });

    it('uses "Instructions not available" when description is missing and never generic repeated sentence', () => {
      const mockItem = {
        id: 789,
        translations: [
          { language: 2, name: 'Mystery Exercise', description: '' }
        ]
      };
      const normalized = normalizeWgerExercise(mockItem);
      expect(normalized.instructions).toBe('Instructions not available');
      expect(normalized.instructions).not.toContain('Follow standard form and controlled movement throughout the repetition.');
    });

    it('handles numeric IDs for equipment, muscles, and categories gracefully', () => {
      const mockItem = {
        id: 55,
        category: 11, // Chest
        equipment: [1, 3], // Barbell, Dumbbell
        muscles: [4], // Pectoralis major (Chest)
        muscles_secondary: [5], // Triceps
        translations: [
          { language: 2, name: 'Dumbbell Press' }
        ]
      };
      const normalized = normalizeWgerExercise(mockItem);
      expect(normalized.categoryName).toBe('Chest');
      expect(normalized.equipmentList).toEqual(['Barbell', 'Dumbbell']);
      expect(normalized.muscles).toEqual(['Chest', 'Triceps']);
    });
  });

  it('guarantees offline fallback returns exercises with CC compliance attribution', () => {
    const fallback = fallbackToLocalExercises({ search: 'bench' });
    expect(fallback.exercises.length).toBeGreaterThan(0);
    expect(fallback.isFallback).toBe(true);

    const first = fallback.exercises[0];
    expect(first.name.toLowerCase()).toContain('bench');
    expect(first.attributionText).toBeDefined();
    // Must never assume image exists
    expect(first.hasImage).toBe(false);
  });

  it('filters fallback exercises by category correctly', () => {
    const fallback = fallbackToLocalExercises({ category: 11 }); // Chest category id
    expect(fallback.exercises.length).toBeGreaterThan(0);
    const allChest = fallback.exercises.every(e => e.category.includes('chest'));
    expect(allChest).toBe(true);
  });

  it('contains proper metadata mappings for muscles, equipment, and categories', () => {
    expect(WGER_CATEGORIES.length).toBeGreaterThan(5);
    expect(WGER_EQUIPMENT.length).toBeGreaterThan(5);
    expect(WGER_MUSCLES.length).toBeGreaterThan(5);

    const chestCategory = WGER_CATEGORIES.find(c => c.name === 'Chest');
    expect(chestCategory).toBeDefined();
    expect(chestCategory.id).toBe(11);

    // Verify corrected muscle mappings match official wger IDs
    const chestMuscle = WGER_MUSCLES.find(m => m.name.includes('Chest'));
    expect(chestMuscle?.id).toBe(4);

    const absMuscle = WGER_MUSCLES.find(m => m.name.includes('Abs'));
    expect(absMuscle?.id).toBe(6);

    const latMuscle = WGER_MUSCLES.find(m => m.name.includes('Back'));
    expect(latMuscle?.id).toBe(12);
  });
});

